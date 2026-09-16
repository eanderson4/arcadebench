import { MALTLINE_INTERMISSION_MS } from './gameplay-flow';

/** A tiny original arcade skit. Pure elapsed-time poses; no RNG or game state. */
export function intermissionPose(elapsedMs: number, reducedMotion = false): Readonly<{
  returning: boolean; serverX: number; shakeX: number; customerXs: readonly number[]; step: number;
}> {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Intermission time must be finite and nonnegative.');
  const progress = Math.min(1, elapsedMs / MALTLINE_INTERMISSION_MS);
  if (reducedMotion) return Object.freeze({ returning: true, serverX: 285, shakeX: 270,
    customerXs: Object.freeze([365, 410]), step: 0 });
  const returning = progress >= .5;
  const t = returning ? (progress - .5) * 2 : progress * 2;
  const serverX = returning ? 600 - t * 660 : -40 + t * 640;
  return Object.freeze({ returning, serverX,
    shakeX: returning ? serverX - 15 : serverX + 40,
    customerXs: Object.freeze(returning ? [serverX + 80, serverX + 125] : [serverX - 60, serverX - 105]),
    step: Math.sin(t * Math.PI * 16) * 5 });
}

export function drawMaltlineIntermission(ctx: CanvasRenderingContext2D, elapsedMs: number, reducedMotion: boolean): void {
  const pose = intermissionPose(elapsedMs, reducedMotion);
  ctx.save();
  ctx.clearRect(0, 0, 640, 150);
  ctx.fillStyle = '#09251c'; ctx.fillRect(0, 0, 640, 150);
  ctx.fillStyle = '#d8c19a'; ctx.fillRect(0, 121, 640, 3);
  const person = (x: number, color: string, server: boolean): void => {
    ctx.save(); ctx.translate(x, 106);
    if (pose.returning) ctx.scale(-1, 1);
    ctx.fillStyle = '#1c120e';
    ctx.fillRect(-10 + pose.step, 0, 8, 14); ctx.fillRect(3 - pose.step, 0, 8, 14);
    ctx.fillStyle = color; ctx.fillRect(-12, -28, 24, 30);
    ctx.fillStyle = '#e5bb92'; ctx.fillRect(-10, -49, 20, 21);
    ctx.fillRect(9, -42, 5, 6);
    ctx.fillStyle = '#09251c'; ctx.fillRect(5, -44, 3, 3);
    if (server) { ctx.fillStyle = '#fff0d1'; ctx.fillRect(-13, -54, 26, 7); ctx.fillRect(-7, -23, 14, 25); }
    else { ctx.fillStyle = '#543224'; ctx.fillRect(-10, -52, 20, 6); }
    ctx.restore();
  };
  pose.customerXs.forEach((x, i) => person(x, i === 0 ? '#e5b552' : '#b07cae', false));
  person(pose.serverX, '#ed7962', true);
  ctx.fillStyle = '#e3f2df'; ctx.fillRect(pose.shakeX - 8, 65, 16, 23);
  ctx.fillStyle = '#ef96a7'; ctx.fillRect(pose.shakeX - 6, 69, 12, 16);
  ctx.fillStyle = '#fff0d1'; ctx.fillRect(pose.shakeX - 10, 61, 20, 5);
  ctx.fillStyle = '#ed7962'; ctx.fillRect(pose.shakeX + 2, 52, 3, 13);
  ctx.restore();
}
