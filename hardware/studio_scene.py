"""ArcadeBench studio scene — Blender headless photoreal renderer.

Imports the placed STL meshes + material manifest from studio_export.py,
builds PBR materials (powder coat / anodized / PETG / PC / LCD / ...),
lights a studio scene, and renders one PNG per view.

Run:  blender -b --python hardware/studio_scene.py -- \
        --manifest hardware/out/studio/manifest.json \
        --outdir hardware/out --prefix studio \
        --views hero,iso,front,side,display --size 1100 \
        --engine BLENDER_EEVEE_NEXT --samples 64
Optional finish override (repeatable):
        --set powdercoat=0.75,0.10,0.08
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy

# ---------------------------------------------------------------- materials
# preset -> Principled BSDF params (+ texture flavor)
PRESETS = {
    "powdercoat": {"roughness": 0.42, "metallic": 0.0, "coat": 0.25,
                   "coat_rough": 0.30, "orange_peel": True},
    "anodized": {"roughness": 0.32, "metallic": 0.95},
    "anodized_dark": {"roughness": 0.34, "metallic": 0.95, "tint": 0.35},
    "petg": {"roughness": 0.50, "metallic": 0.0, "coat": 0.15},
    "plastic": {"roughness": 0.35, "metallic": 0.0, "coat": 0.35},
    "rubber": {"roughness": 0.90, "metallic": 0.0},
    "metal": {"roughness": 0.22, "metallic": 1.0},
    "pcb": {"roughness": 0.55, "metallic": 0.0, "coat": 0.20},
    "lcd": {"roughness": 0.10, "metallic": 0.10, "coat": 1.0, "coat_rough": 0.08},
    "fabric": {"roughness": 0.85, "metallic": 0.0},
    "pc_clear": {"roughness": 0.08, "metallic": 0.0, "transmission": 1.0,
                 "ior": 1.585},
}


def _set(node, names, value):
    """Set a Principled input by any of its version-dependent names."""
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def make_material(preset, color):
    params = dict(PRESETS.get(preset, PRESETS["plastic"]))
    if "tint" in params:
        color = [c * params["tint"] for c in color]
    mat = bpy.data.materials.new(f"{preset}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    _set(bsdf, ["Base Color"], (*color, 1.0))
    _set(bsdf, ["Metallic"], params.get("metallic", 0.0))
    _set(bsdf, ["Roughness"], params.get("roughness", 0.5))
    _set(bsdf, ["Coat Weight", "Clearcoat"], params.get("coat", 0.0))
    _set(bsdf, ["Coat Roughness", "Clearcoat Roughness"],
         params.get("coat_rough", 0.2))
    _set(bsdf, ["Transmission Weight", "Transmission"],
         params.get("transmission", 0.0))
    _set(bsdf, ["IOR"], params.get("ior", 1.45))
    if params.get("orange_peel"):
        nt = mat.node_tree
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 900.0   # ~mm orange peel
        noise.inputs["Detail"].default_value = 2.0
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.15
        bump.inputs["Distance"].default_value = 0.00015
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ------------------------------------------------------------------- scene
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_meshes(manifest, studio_dir, overrides):
    mats = {}
    for entry in manifest:
        path = studio_dir / entry["file"]
        before = set(bpy.data.objects)
        bpy.ops.wm.stl_import(filepath=str(path), global_scale=0.001)
        new = [o for o in bpy.data.objects if o not in before]
        # overrides match component name first, then material preset
        color = overrides.get(entry["name"],
                              overrides.get(entry["preset"], entry["color"]))
        key = (entry["preset"], tuple(color))
        if key not in mats:
            mats[key] = make_material(entry["preset"], color)
        for obj in new:
            obj.name = entry["name"]
            obj.data.materials.clear()
            obj.data.materials.append(mats[key])
            for poly in obj.data.polygons:
                poly.use_smooth = True
            try:  # auto smooth keeps flats crisp, rounds fillets
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.shade_auto_smooth(
                    angle=math.radians(40), use_auto_smooth=True)
            except Exception:
                pass
    return [o for o in bpy.data.objects if o.type == "MESH"]


def add_ground(z):
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, z))
    g = bpy.context.object
    g.name = "ground"
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    _set(bsdf, ["Base Color"], (0.80, 0.80, 0.80, 1.0))
    _set(bsdf, ["Roughness"], 0.65)
    g.data.materials.append(mat)


def add_lights():
    def area(name, loc, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        d = -obj.location
        obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    # meters; cabinet center ~(0, 0.17, 0.2). Modest power: the machine is
    # 0.4 m tall — 100s of watts at 2 m is several stops over.
    area("key", (-1.4, -1.6, 2.2), 60, 1.6, (1.0, 0.96, 0.90))
    area("fill", (1.6, -0.8, 1.2), 25, 1.4, (0.90, 0.95, 1.0))
    area("rim", (0.4, 1.8, 1.8), 45, 1.2, (1.0, 1.0, 1.0))


def add_world():
    # flat neutral world: a Nishita sky carries HDR values (sun disc ~1e3)
    # that turn every Fresnel/coated reflection into a blowout
    world = bpy.data.worlds.new("studio")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.50, 0.50, 0.53, 1.0)
    bg.inputs["Strength"].default_value = 0.4


def scene_bbox(objs):
    import mathutils
    pts = []
    for o in objs:
        if o.name == "ground":
            continue
        for corner in o.bound_box:
            pts.append(o.matrix_world @ mathutils.Vector(corner))
    lo = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts),
                           min(p.z for p in pts)))
    hi = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts),
                           max(p.z for p in pts)))
    return lo, hi


def render_views(views, objs, outdir, prefix, size):
    import mathutils
    lo, hi = scene_bbox(objs)
    center = (lo + hi) / 2
    corners = [mathutils.Vector((x, y, z)) for x in (lo.x, hi.x)
               for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    for name, spec in views.items():
        el, az = math.radians(spec["elev"]), math.radians(spec["azim"])
        direction = mathutils.Vector(
            (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az),
             math.sin(el)))
        target = mathutils.Vector(spec["target"]) if spec.get("target") \
            else center
        cam_data = bpy.data.cameras.new(name)
        cam_data.type = "ORTHO"
        cam = bpy.data.objects.new(name, cam_data)
        bpy.context.collection.objects.link(cam)
        cam.location = target + direction * 3.0
        cam.rotation_euler = (target - cam.location).to_track_quat(
            "-Z", "Y").to_euler()
        right = direction.cross(mathutils.Vector((0, 0, 1))).normalized() \
            if abs(direction.z) < 0.99 else mathutils.Vector((1, 0, 0))
        up = right.cross(direction).normalized()
        if spec.get("scale"):
            cam_data.ortho_scale = spec["scale"] / 1000.0
        else:
            span = 0.0
            for c in corners:
                rel = c - target
                span = max(span, abs(rel.dot(right)), abs(rel.dot(up)))
            cam_data.ortho_scale = 2 * span * 1.08
        bpy.context.scene.camera = cam
        bpy.context.scene.render.filepath = str(outdir / f"{prefix}_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {prefix}_{name}.png")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--prefix", default="studio")
    ap.add_argument("--views", default="hero,iso,front,side")
    ap.add_argument("--size", type=int, default=1100)
    ap.add_argument("--engine", default="BLENDER_EEVEE_NEXT")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--set", action="append", default=[],
                    help="preset=r,g,b finish override (repeatable)")
    args = ap.parse_args(argv)

    overrides = {}
    for item in args.set:
        preset, rgb = item.split("=")
        overrides[preset] = [float(v) for v in rgb.split(",")]

    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text())
    views = json.loads((manifest_path.parent / "views.json").read_text())
    views = {k: v for k, v in views.items() if k in args.views.split(",")}

    clear_scene()
    objs = import_meshes(manifest, manifest_path.parent, overrides)
    lo, hi = scene_bbox(objs)
    add_ground(lo.z - 0.001)
    add_lights()
    add_world()

    scene = bpy.context.scene
    try:
        scene.render.engine = args.engine
    except Exception:
        scene.render.engine = "BLENDER_EEVEE_NEXT" \
            if args.engine != "BLENDER_EEVEE_NEXT" else "CYCLES"
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = args.samples
        scene.cycles.use_denoising = True
        scene.cycles.use_adaptive_sampling = True
    scene.render.resolution_x = scene.render.resolution_y = args.size
    scene.render.image_settings.file_format = "PNG"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass

    render_views(views, objs, Path(args.outdir), args.prefix, args.size)


main()
