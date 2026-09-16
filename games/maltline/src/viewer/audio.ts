import type { GameEvent, MaltlineState } from '../core/types';

export type MaltlineSoundCue =
  | 'lane-move'
  | 'flavor-move'
  | 'order'
  | 'ready'
  | 'serve'
  | 'served'
  | 'jar-caught'
  | 'failure'
  | 'stage-clear'
  | 'game-over'
  | 'countdown'
  | 'start';

/** Convert deterministic game output into presentation-only sound cues. */
export function maltlineSoundCues(
  before: Readonly<MaltlineState>,
  after: Readonly<MaltlineState>,
  events: readonly GameEvent[],
): MaltlineSoundCue[] {
  const cues = new Set<MaltlineSoundCue>();
  if (before.player.lane !== after.player.lane) cues.add('lane-move');
  if (before.player.station !== after.player.station) cues.add('flavor-move');
  for (const event of events) {
    switch (event.type) {
      case 'customer_spawned': cues.add('order'); break;
      case 'blend_completed': cues.add('ready'); break;
      case 'shake_launched': cues.add('serve'); break;
      case 'served': cues.add('served'); break;
      case 'jar_caught': cues.add('jar-caught'); break;
      case 'shake_smashed':
      case 'jar_smashed':
      case 'walkout':
      case 'life_lost': cues.add('failure'); break;
      case 'stage_cleared': cues.add('stage-clear'); break;
      case 'game_lost': cues.add('game-over'); break;
      case 'customer_exited':
      case 'jar_returned': break;
    }
  }
  if (cues.has('game-over')) cues.delete('failure');
  return [...cues];
}

type AudioContextFactory = () => AudioContext | null;

function browserAudioContext(): AudioContext | null {
  const constructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!constructor) return null;
  try { return new constructor(); } catch { return null; }
}

/** Small procedural cabinet synth. It never reads or mutates game state. */
export class MaltlineAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private blendVoice: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private muted = false;
  private gameplayActive = false;

  constructor(private readonly createContext: AudioContextFactory = browserAudioContext) {}

  isMuted(): boolean { return this.muted; }

  unlock(): void {
    if (this.muted) return;
    if (!this.context) {
      this.context = this.createContext();
      if (!this.context) return;
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    if (!this.muted) this.unlock();
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.18, this.context.currentTime, 0.01);
    }
    if (this.muted) this.stopBlend();
    return this.muted;
  }

  setGameplayActive(active: boolean): void {
    this.gameplayActive = active;
    if (!active) this.stopBlend();
  }

  update(before: Readonly<MaltlineState>, after: Readonly<MaltlineState>, events: readonly GameEvent[]): void {
    if (!this.gameplayActive) return;
    this.syncBlend(after.player.blending !== null);
    for (const cue of maltlineSoundCues(before, after, events)) this.play(cue);
  }

  play(cue: MaltlineSoundCue): void {
    if (this.muted) return;
    this.unlock();
    switch (cue) {
      case 'lane-move': this.tone(185, 0.045, 'triangle', 0.22, 155); break;
      case 'flavor-move': this.sequence([294, 392], 0.045, 'square', 0.2); break;
      case 'order': this.sequence([523, 659], 0.055, 'sine', 0.16); break;
      case 'ready': this.sequence([659, 880], 0.075, 'triangle', 0.28); break;
      case 'serve': this.tone(220, 0.12, 'sawtooth', 0.2, 110); break;
      case 'served': this.sequence([392, 523, 659], 0.06, 'triangle', 0.22); break;
      case 'jar-caught': this.sequence([784, 988], 0.04, 'sine', 0.25); break;
      case 'failure': this.sequence([196, 147, 98], 0.09, 'sawtooth', 0.28); break;
      case 'stage-clear': this.sequence([330, 440, 554, 659], 0.1, 'triangle', 0.25); break;
      case 'game-over': this.sequence([247, 196, 147, 98], 0.13, 'square', 0.22); break;
      case 'countdown': this.tone(330, 0.075, 'square', 0.2); break;
      case 'start': this.sequence([440, 659, 880], 0.07, 'square', 0.24); break;
    }
  }

  private syncBlend(blending: boolean): void {
    if (!blending || this.muted || !this.gameplayActive) {
      this.stopBlend();
      return;
    }
    this.unlock();
    if (this.blendVoice || !this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 82;
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, this.context.currentTime + 0.04);
    oscillator.connect(gain); gain.connect(this.master); oscillator.start();
    this.blendVoice = { oscillator, gain };
  }

  private stopBlend(): void {
    if (!this.blendVoice || !this.context) return;
    const { oscillator, gain } = this.blendVoice;
    this.blendVoice = null;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.015);
    oscillator.stop(now + 0.08);
  }

  private sequence(frequencies: readonly number[], duration: number, type: OscillatorType, volume: number): void {
    const start = this.context?.currentTime ?? 0;
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, type, volume, undefined,
      start + index * duration * 0.82));
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
