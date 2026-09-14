import type { FlavorId } from '../core/types';
import { MALTLINE_VISUAL_THEME } from './visual-theme';

const FLAVOR_ART = MALTLINE_VISUAL_THEME.flavors;
const CREAM_DIM = MALTLINE_VISUAL_THEME.scene.creamDim;
const RETURN_JAR = MALTLINE_VISUAL_THEME.returnJar;
const OUTGOING_SHAKE = MALTLINE_VISUAL_THEME.outgoingShake;

/** Shared ingredient silhouettes: swirl, segmented chocolate bar, and seeded berry. */
export function drawMaltlineFlavorSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flavor: FlavorId,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fff2d1';
  if (flavor === 'vanilla') {
    ctx.fillStyle = '#fff2d1';
    ctx.beginPath();
    ctx.moveTo(-9, 8);
    ctx.quadraticCurveTo(-13, 2, -6, -1);
    ctx.quadraticCurveTo(-10, -6, -2, -8);
    ctx.quadraticCurveTo(3, -10, 2, -15);
    ctx.quadraticCurveTo(11, -9, 6, -5);
    ctx.quadraticCurveTo(13, -2, 8, 2);
    ctx.quadraticCurveTo(14, 7, 8, 10);
    ctx.lineTo(-7, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#bd925c';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(0, 4, 7, 1);
    ctx.moveTo(-2, -7);
    ctx.quadraticCurveTo(1, -4, 6, -5);
    ctx.stroke();
  } else if (flavor === 'chocolate') {
    // A segmented bar stays unmistakably "chocolate" at tiny arcade-icon
    // sizes; the earlier single cocoa bean read too much like an emoji.
    ctx.rotate(-0.16);
    ctx.fillStyle = '#6e351f';
    ctx.beginPath();
    ctx.roundRect(-10, -13, 20, 26, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a66438';
    ctx.strokeStyle = '#d99b62';
    ctx.lineWidth = 1;
    for (const [barX, barY] of [[-8, -11], [1, -11], [-8, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.roundRect(barX!, barY!, 7, 10, 1.5);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = '#f4c68b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(-2, -8);
    ctx.moveTo(3, -8);
    ctx.lineTo(7, -8);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ee6381';
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.bezierCurveTo(-20, -2, -10, -14, 0, -8);
    ctx.bezierCurveTo(10, -14, 20, -2, 0, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8fc56c';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(-9, -12);
    ctx.lineTo(-2, -10);
    ctx.lineTo(1, -16);
    ctx.lineTo(4, -10);
    ctx.lineTo(10, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff0c2';
    for (const [sx, sy] of [[-5, -3], [4, -3], [-3, 3], [3, 3], [0, 8]]) {
      ctx.beginPath();
      ctx.ellipse(sx!, sy!, 1, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Two-tone soft-serve swirl used by order tickets and shake cups. */
export function drawMaltlineSoftServe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flavor: FlavorId,
  scale: number,
): void {
  const art = FLAVOR_ART[flavor];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const tiers: Array<[number, number, number]> = [
    [0, 2, 6.5],
    [0, -3, 5],
    [0, -7.5, 3.5],
    [0, -10.5, 2],
  ];
  for (const [tx, ty, radius] of tiers) {
    ctx.fillStyle = art.base;
    ctx.beginPath();
    ctx.arc(tx, ty, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = art.light;
  ctx.beginPath();
  ctx.arc(-1.5, -7, 2.2, 0, Math.PI * 2);
  ctx.arc(-2, 1, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = art.dark;
  ctx.beginPath();
  ctx.arc(2.5, 0.5, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawMaltlineCup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flavor: FlavorId,
  scale: number,
  rotate = 0,
  outgoing = false,
): void {
  const art = FLAVOR_ART[flavor];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);
  ctx.scale(scale, scale);

  if (outgoing) {
    ctx.fillStyle = OUTGOING_SHAKE.shadow;
    ctx.beginPath();
    ctx.roundRect(-10, -29, 20, 43, 7);
    ctx.fill();
    ctx.strokeStyle = OUTGOING_SHAKE.edge;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  const body = ctx.createLinearGradient(-7, 0, 7, 0);
  body.addColorStop(0, CREAM_DIM);
  body.addColorStop(0.35, '#fdf6e4');
  body.addColorStop(1, CREAM_DIM);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-7, -12);
  ctx.lineTo(7, -12);
  ctx.lineTo(5, 12);
  ctx.lineTo(-5, 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = art.base;
  ctx.beginPath();
  ctx.moveTo(-6.4, -4);
  ctx.lineTo(6.4, -4);
  ctx.lineTo(5.6, 4);
  ctx.lineTo(-5.6, 4);
  ctx.closePath();
  ctx.fill();

  drawMaltlineFlavorSymbol(ctx, 0, 1, flavor, 0.36);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.roundRect(-4.5, -11, 2.4, 20, 1.2);
  ctx.fill();

  ctx.fillStyle = '#fdf6e4';
  ctx.beginPath();
  ctx.arc(0, -12, 7.4, Math.PI, 0);
  ctx.fill();
  drawMaltlineSoftServe(ctx, 0, -14, flavor, 0.72);

  ctx.strokeStyle = '#ff8f6b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(2.5, -16);
  ctx.lineTo(6.5, -25);
  ctx.stroke();
  ctx.restore();
}

/** A transparent in-hand cup whose liquid height is the exact blend fraction. */
export function drawMaltlinePouringCup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flavor: FlavorId,
  progress: number,
  scale = 1,
  motionPhase: number | null = null,
): void {
  const fill = Math.min(1, Math.max(0, progress));
  const art = FLAVOR_ART[flavor];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#183b35';
  ctx.strokeStyle = '#112c27';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-11, -18);
  ctx.lineTo(11, -18);
  ctx.lineTo(8, 15);
  ctx.lineTo(-8, 15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#fff5db';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-8.5, -15);
  ctx.lineTo(8.5, -15);
  ctx.lineTo(6, 12);
  ctx.lineTo(-6, 12);
  ctx.closePath();
  ctx.clip();
  const surfaceY = 12 - 27 * fill;
  ctx.fillStyle = art.base;
  ctx.fillRect(-9, surfaceY, 18, 27 * fill);
  if (fill > 0) {
    ctx.strokeStyle = art.light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, surfaceY);
    ctx.lineTo(9, surfaceY);
    ctx.stroke();
    if (motionPhase !== null) {
      ctx.fillStyle = art.light;
      for (let bubble = 0; bubble < 3; bubble++) {
        const rise = (motionPhase + bubble / 3) % 1;
        ctx.beginPath();
        ctx.arc(-4 + bubble * 4, 11 - rise * (11 - surfaceY), 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.lineTo(-4.5, 8);
  ctx.stroke();
  ctx.strokeStyle = '#fff5db';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-11, -18);
  ctx.lineTo(11, -18);
  ctx.stroke();
  ctx.restore();
}

export function drawMaltlineJar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  emphasis = false,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (emphasis) {
    ctx.fillStyle = 'rgba(7, 26, 20, 0.82)';
    ctx.beginPath();
    ctx.roundRect(-10.5, -16, 21, 31, 7);
    ctx.fill();
  }
  const glass = ctx.createLinearGradient(-7, 0, 7, 0);
  glass.addColorStop(0, emphasis ? RETURN_JAR.body : 'rgba(207, 216, 212, 0.55)');
  glass.addColorStop(0.4, emphasis ? '#f0f6f4' : 'rgba(240, 246, 244, 0.35)');
  glass.addColorStop(1, emphasis ? '#b4c4be' : 'rgba(180, 196, 190, 0.55)');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(-6.5, -10);
  ctx.lineTo(6.5, -10);
  ctx.lineTo(5, 11);
  ctx.lineTo(-5, 11);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = emphasis ? RETURN_JAR.edge : 'rgba(230, 240, 237, 0.85)';
  ctx.lineWidth = emphasis ? 1.8 : 1.4;
  ctx.stroke();
  ctx.fillStyle = emphasis ? RETURN_JAR.rim : '#cfd8d4';
  ctx.beginPath();
  ctx.roundRect(-7.5, -13, 15, 4, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.roundRect(-3.5, -7, 2, 9, 1);
  ctx.fill();
  ctx.restore();
}
