import type { FlavorId } from '../core/types';
import { MALTLINE_VISUAL_THEME } from './visual-theme';

const FLAVOR_CUES = MALTLINE_VISUAL_THEME.flavorCues;
const FLAVOR_ART = MALTLINE_VISUAL_THEME.flavors;
const CREAM_DIM = MALTLINE_VISUAL_THEME.scene.creamDim;
const RETURN_JAR = MALTLINE_VISUAL_THEME.returnJar;
const OUTGOING_SHAKE = MALTLINE_VISUAL_THEME.outgoingShake;

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

  ctx.fillStyle = flavor === 'vanilla' ? '#54301a' : '#fff8ea';
  ctx.font = '800 7px "Maltline UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(FLAVOR_CUES[flavor], 0, 0.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

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
