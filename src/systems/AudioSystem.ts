export class AudioSystem {
  private readonly PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00];

  private context: AudioContext | null = null;
  private unlocked = false;
  private masterGain: GainNode | null = null;

  private bgmGain: GainNode | null = null;
  private bgmOscillators: OscillatorNode[] = [];
  private bgmInterval: number | null = null;
  private bgmPlaying = false;

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.context.destination);
    await this.context.resume();

    // Start ambient nature sounds
    this.startAmbience();
    this.unlocked = true;
  }

  private startAmbience(): void {
    if (!this.context) return;
    // Birds chirping periodically
    const scheduleBird = () => {
      if (!this.context || this.context.state !== 'running') return;
      this.birdChirp();
      const delay = 3000 + Math.random() * 8000;
      setTimeout(scheduleBird, delay);
    };
    scheduleBird();

    // Wind ambience - filtered noise
    this.windAmbience();
  }

  private windAmbience(): void {
    if (!this.context || !this.masterGain) return;

    const bufferSize = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.03;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lpf = this.context.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 300;
    lpf.Q.value = 1;

    const lpf2 = this.context.createBiquadFilter();
    lpf2.type = 'highpass';
    lpf2.frequency.value = 80;

    const gain = this.context.createGain();
    gain.gain.value = 0.06;

    // Wind gusts
    const gustOsc = this.context.createOscillator();
    gustOsc.type = 'sine';
    gustOsc.frequency.value = 0.05;
    const gustGain = this.context.createGain();
    gustGain.gain.value = 0.5;
    gustOsc.connect(gustGain);
    gustGain.connect(gain.gain);

    source.connect(lpf).connect(lpf2).connect(gain).connect(this.masterGain);
    gustOsc.start();
    source.start();
  }

  private birdChirp(): void {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    const freq = 2000 + Math.random() * 2000;
    const duration = 0.05 + Math.random() * 0.1;

    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + duration);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.1);
  }

  feed(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Pleasant chime for feeding
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  deerHappy(): void {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;

    // Happy deer sound - quick ascending notes
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.08;
      const osc = this.context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400 + i * 100, t);
      osc.frequency.exponentialRampToValueAtTime(600 + i * 100, t + 0.06);

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  victory(): void {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;

    // Victory fanfare - temple bell style
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * 0.2;
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = notes[i];

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.6);
    }
  }

  templeBell(): void {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;

    // Deep temple bell
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 110;

    const osc2 = this.context.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 165;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 3);
    osc2.stop(now + 3);
  }

  error(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Short buzzer for error
    const osc = this.context.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.15);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  startBGM(level: number): void {
    if (!this.context || this.bgmPlaying) return;
    this.bgmPlaying = true;

    this.bgmGain = this.context.createGain();
    this.bgmGain.gain.value = 0.08;
    this.bgmGain.connect(this.masterGain!);

    const melody = this.context.createOscillator();
    melody.type = 'triangle';
    const melodyFilter = this.context.createBiquadFilter();
    melodyFilter.type = 'lowpass';
    melodyFilter.frequency.value = 800;
    melody.connect(melodyFilter);
    melodyFilter.connect(this.bgmGain);

    const harmony = this.context.createOscillator();
    harmony.type = 'sine';
    const harmonyGain = this.context.createGain();
    harmonyGain.gain.value = 0.04;
    harmony.connect(harmonyGain);
    harmonyGain.connect(this.bgmGain);

    const drumGain = this.context.createGain();
    drumGain.gain.value = 0.05;
    drumGain.connect(this.bgmGain);

    this.bgmOscillators = [melody, harmony];
    melody.start();
    harmony.start();

    const bpm = Math.min(60 + Math.floor((level - 1) / 5) * 5, 80);
    const noteDuration = 60 / bpm;
    let noteIndex = 0;

    const playNextNote = () => {
      if (!this.context || !this.bgmPlaying) return;
      const now = this.context.currentTime;
      const freq = this.PENTATONIC[noteIndex % this.PENTATONIC.length];
      melody.frequency.setValueAtTime(freq, now);
      melody.frequency.exponentialRampToValueAtTime(freq * 1.01, now + noteDuration * 0.5);
      harmony.frequency.setValueAtTime(freq * 0.5, now);
      noteIndex++;
      if (noteIndex % 4 === 0) {
        const drumOSc = this.context.createOscillator();
        drumOSc.type = 'sine';
        drumOSc.frequency.value = 60;
        const drumEnv = this.context.createGain();
        drumEnv.gain.setValueAtTime(0.08, now);
        drumEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        drumOSc.connect(drumEnv);
        drumEnv.connect(drumGain);
        drumOSc.start(now);
        drumOSc.stop(now + 0.2);
      }
      this.bgmInterval = window.setTimeout(playNextNote, noteDuration * 1000);
    };
    playNextNote();
  }

  stopBGM(): void {
    this.bgmPlaying = false;
    if (this.bgmInterval !== null) {
      clearTimeout(this.bgmInterval);
      this.bgmInterval = null;
    }
    for (const osc of this.bgmOscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    this.bgmOscillators = [];
    this.bgmGain = null;
  }

  splash(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  angryDeer(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 80;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  coin(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 + i * 400, now + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(1800 + i * 400, now + i * 0.04 + 0.05);
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.06, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.12);
    }
  }

  buyCracker(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const bufferSize = this.context.sampleRate * 0.05;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.5;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    source.connect(filter).connect(gain);
    gain.connect(this.masterGain!);
    source.start(now);
  }

  heartbeat(intensity: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 40;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  adComplete(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600 + i * 200, now + i * 0.06);
      osc.frequency.exponentialRampToValueAtTime(800 + i * 200, now + i * 0.06 + 0.08);
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.05, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.2);
    }
  }

  dispose(): void {
    this.stopBGM();
    void this.context?.close();
    this.context = null;
  }
}
