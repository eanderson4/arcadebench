/**
 * Tiny synthesized sound set for Smilefall. It ships no audio files and only
 * creates an AudioContext after a player gesture, which keeps autoplay rules
 * and a muted first visit predictable.
 */
export class SmilefallAudio {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.context?.state === 'running') void this.context.suspend();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async unlock(): Promise<void> {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  playEvent(event: { type: string }): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    switch (event.type) {
      case 'smiley_caught':
        this.tone(660, 0.075, 'sine', 0.045, 140);
        break;
      case 'smiley_bruised':
        this.tone(150, 0.09, 'triangle', 0.055, -45);
        break;
      case 'smiley_popped':
        this.noise(0.12, 0.075);
        this.tone(105, 0.14, 'sawtooth', 0.04, -55);
        break;
      case 'flock_hopped':
        this.tone(330, 0.09, 'sine', 0.035, 210);
        break;
      case 'bucket_filled':
        this.chord([523, 659, 784], 0.16, 0.035);
        break;
      case 'level_won':
        this.arpeggio([523, 659, 784, 1047], 0.07);
        break;
      case 'game_lost':
        this.arpeggio([294, 247, 196], 0.1);
        break;
    }
  }

  click(): void {
    this.tone(420, 0.04, 'square', 0.018, 35);
  }

  private tone(
    frequency: number,
    duration: number,
    shape: OscillatorType,
    volume: number,
    sweep = 0,
    delay = 0,
  ): void {
    const context = this.context;
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.linearRampToValueAtTime(Math.max(35, frequency + sweep), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private chord(frequencies: readonly number[], duration: number, volume: number): void {
    frequencies.forEach((frequency) => this.tone(frequency, duration, 'sine', volume));
  }

  private arpeggio(frequencies: readonly number[], step: number): void {
    frequencies.forEach((frequency, index) => {
      this.tone(frequency, step * 1.8, 'triangle', 0.04, 40, index * step);
    });
  }

  private noise(duration: number, volume: number): void {
    const context = this.context;
    if (!context) return;
    const samples = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, samples, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples; index++) {
      const envelope = 1 - index / samples;
      channel[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    source.start();
  }
}
