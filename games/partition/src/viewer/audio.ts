import type { GameEvent } from '../core/types';

export type PartitionSoundCue = 'trace-open' | 'partition' | 'damage' | 'time-up' | 'win' | 'loss';

export function partitionSoundCues(events: readonly GameEvent[]): PartitionSoundCue[] {
  const cues = new Set<PartitionSoundCue>();
  for (const event of events) {
    switch (event.type) {
      case 'trace_started': cues.add('trace-open'); break;
      case 'trace_completed': cues.add('partition'); break;
      case 'trace_hit': cues.add('damage'); break;
      case 'time_expired': cues.add('time-up'); break;
      case 'level_won': cues.add('win'); break;
      case 'game_lost': cues.add('loss'); break;
      case 'controller_installed': break;
    }
  }
  if (cues.has('loss')) cues.delete('damage');
  return [...cues];
}

type AudioContextFactory = () => AudioContext | null;

function browserAudioContext(): AudioContext | null {
  const constructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!constructor) return null;
  try { return new constructor(); } catch { return null; }
}

/** Procedural field cues kept outside the deterministic engine and replay. */
export class PartitionAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  constructor(private readonly createContext: AudioContextFactory = browserAudioContext) {}

  isMuted(): boolean { return this.muted; }

  unlock(): void {
    if (this.muted) return;
    if (!this.context) {
      this.context = this.createContext();
      if (!this.context) return;
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    if (!this.muted) this.unlock();
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.16, this.context.currentTime, 0.01);
    }
    return this.muted;
  }

  playEvents(events: readonly GameEvent[]): void {
    for (const cue of partitionSoundCues(events)) this.play(cue);
  }

  play(cue: PartitionSoundCue): void {
    if (this.muted) return;
    this.unlock();
    switch (cue) {
      case 'trace-open': this.tone(420, 0.055, 'square', 0.18, 620); break;
      case 'partition': this.sequence([330, 495, 660], 0.055, 'triangle', 0.25); break;
      case 'damage': this.sequence([170, 105], 0.11, 'sawtooth', 0.32); break;
      case 'time-up': this.sequence([280, 210, 140], 0.12, 'square', 0.25); break;
      case 'win': this.sequence([392, 523, 659, 784], 0.085, 'triangle', 0.27); break;
      case 'loss': this.sequence([220, 165, 110], 0.14, 'sawtooth', 0.28); break;
    }
  }

  private sequence(frequencies: readonly number[], duration: number, type: OscillatorType, volume: number): void {
    const start = this.context?.currentTime ?? 0;
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, type, volume, undefined,
      start + index * duration * 0.84));
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFrequency?: number,
    startAt?: number,
  ): void {
    if (!this.context || !this.master || this.muted) return;
    const start = startAt ?? this.context.currentTime;
    const end = start + duration;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + Math.min(0.008, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain); gain.connect(this.master);
    oscillator.start(start); oscillator.stop(end + 0.01);
  }
}
