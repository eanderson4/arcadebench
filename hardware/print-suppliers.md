# Print-and-Ship Suppliers — PETG Prototype Shell

Researched 2026-08-25 for the 8-part PETG prototype print
(`hardware/exports/print-parts/*.step`). Largest parts: `mid` 340×161×175 mm,
`hood` 340×161×111 mm → **hard requirement: FDM bed ≥ ~345 mm in one axis.**
All listed services accept online file upload with instant quoting and ship to
the USA. Sources archived in `hardware/out/research/suppliers-{1,2}/`.
Key figures fact-checked against supplier pages with `research verify` —
all 6 primary sources PASS (verdict files alongside the notes).

## Comparison

| Supplier | PETG? | Max FDM build (mm) | Fits 340 mm parts? | Turnaround | Notes |
|---|---|---|---|---|---|
| **Craftcloud** (craftcloud3d.com) | Yes (+PETG-CF) | 1200×1350×1200 (network max) | ✅ easily | Varies by partner | Price-comparison aggregator over 180+ bureaus — one upload, multiple live quotes. Best first stop. |
| **Protolabs Network** (hubs.com) | Yes | 500×500×500 (std FDM); 406×355×406 (Fortus) | ✅ | From 2–3 business days | Formerly Hubs. PETG listed as standard FDM material. |
| **Makelab** (makelab.com) | Yes | Large-format available (SLA 1700 / FGF 2400; FDM std) | ✅ | 1–5 business days | Brooklyn NY, in-house, 1-part minimum, no setup fees. US-domestic = fast/cheap shipping. |
| **Shapeways** (shapeways.com) | Yes | 500×500×500 | ✅ (note: >300 mm dims may restrict orientation) | Days | **$300 minimum per color** — our 8-part set likely clears this anyway. Parts priced in uploaded orientation. |
| **PCBWay** (pcbway.com) | Yes (+PETG-CF) | 600×500×500 (FDM) | ✅ | Days | China-based, cheap; relative pricing only ($$ tier) until quote. Watch holiday schedules + shipping time. |
| **Xometry** (xometry.com) | Yes, but… | Instant-quote PETG capped at 256×256×256 | ❌ for PETG | 3 days min | PETG instant-quote line too small. Their big Fortus FDM (up to 24″×36″×36″) is ABS/ASA/PC/ULTEM — viable if we switch material to ABS/ASA. Free US shipping. |
| **JLC3DP** (jlc3dp.com) | **No PETG listed** | 580×480×480 (ABS/PA12-CF/PEEK); 250×250×300 (ASA/PLA/TPU) | ⚠️ ABS only at our size | From 3 days | Cheapest tier. Only viable in ABS; ASA caps at 250 mm. STL upload. |
| **Upside Parts** (upsideparts.com) | Yes (+CF-PETG) | 300×300×300 standard | ❌ | 1 business day rush option | US, fast, but bed too small for mid/hood/base_f. |
| **Treatstock** (treatstock.com) | Yes | Varies by vendor (1100+ PETG vendors) | ⚠️ pick a large-bed vendor | Varies | Marketplace of small bureaus; filter by build volume. Hit-or-miss but can be cheapest. |
| **Fictiv** (fictiv.com) | Quote-based | — | ⚠️ | Days | Enterprise-leaning; better for production quotes than one-off prototypes. Include for completeness. |

## Recommendation

1. **First upload: Craftcloud** — one STEP upload gives live prices across many
   bureaus; establishes the market price for the full 8-part set in ~10 min.
2. **Also quote: Protolabs Network + Makelab** — both confirmed PETG at ≥500 mm,
   US-friendly, fast. Makelab is fully domestic (Brooklyn).
3. **Budget option: PCBWay** — PETG/PETG-CF at 600 mm bed, typically the lowest
   price, at the cost of international shipping time.
4. **Material fallback:** if PETG quoting is thin, **ASA or ABS** is an
   acceptable prototype substitute (ASA = UV-stable, similar toughness) and
   unlocks Xometry Fortus + JLC3DP.

Estimated total for the 8-part set: **~$150–400** depending on bureau
(previous estimate; confirm with live quotes).

## Quoting checklist per supplier

- Upload `hardware/exports/print-parts/*.step` (assembly coordinates — bureaus
  print one part per file, orientation is ours to specify).
- Material: PETG (or PETG-CF for the base if price is close — stiffer deck).
- Layer height 0.2 mm, ≥3 walls, ≥15% infill if configurable.
- Note the heat-set-insert holes are sized for after-print installation;
  no special handling needed.
