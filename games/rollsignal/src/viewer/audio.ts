import type { RollSignalEvent } from '../core/types';

export class RollSignalAudio {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) void this.context?.suspend();
    else if (this.context?.state === 'suspended') void this.context.resume();
  }

  async unlock(): Promise<void> {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  notify(events: readonly RollSignalEvent[]): void {
    if (!this.enabled || !this.context) return;
    for (const event of events) {
      if (event.type === 'tone_ring') this.chime(740, 0.08, 'sine', 0.075);
      if (event.type === 'checkpoint_reached') this.chime(420, 0.12, 'triangle', 0.07);
      if (event.type === 'relay_pad') {
        this.chime(330, 0.08, 'square', 0.04);
        this.chime(660, 0.16, 'triangle', 0.06, 0.06);
      }
      if (event.type === 'fell') this.slide(170, 78, 0.28, 0.07);
      if (event.type === 'goal_reached') {
        this.chime(392, 0.12, 'triangle', 0.07);
        this.chime(523, 0.16, 'triangle', 0.07, 0.11);
        this.chime(784, 0.32, 'sine', 0.08, 0.24);
      }
    }
  }

  ui(): void {
    this.chime(510, 0.055, 'square', 0.025);
  }

  private chime(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private slide(from: number, to: number, duration: number, volume: number): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
