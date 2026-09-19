import type { BlockshopEvent } from '../core/types';

export class BlockshopAudio {
  private context: AudioContext | null = null;
  enabled = true;

  unlock(): void {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    void this.context.resume();
  }

  play(events: readonly BlockshopEvent[]): void {
    if (!this.enabled || !this.context) return;
    for (const event of events) {
      if (event.type === 'brick_hit') this.tone(event.material === 'steel' ? 610 : 190, 0.045, event.material === 'steel' ? 'sine' : 'square', 0.035);
      if (event.type === 'brick_broken') this.tone(250 + Math.min(220, event.points), 0.06, 'square', 0.045);
      if (event.type === 'paddle_hit') this.tone(125, 0.045, 'triangle', 0.055);
      if (event.type === 'power_collected') {
        this.tone(360, 0.07, 'triangle', 0.05);
        this.tone(540, 0.08, 'triangle', 0.035, 0.055);
      }
      if (event.type === 'ball_lost') this.tone(92, 0.22, 'sawtooth', 0.04);
      if (event.type === 'stage_won') {
        this.tone(330, 0.1, 'triangle', 0.045);
        this.tone(495, 0.13, 'triangle', 0.04, 0.09);
      }
    }
  }

  private tone(frequency: number, duration: number, shape: OscillatorType, volume: number, delay = 0): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}
