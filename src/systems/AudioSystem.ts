export class AudioSystem {
  // Japanese in Sen scale (D, Eb, G, A, Bb, D)
  private readonly IN_SEN = [293.66, 311.13, 392.00, 440.00, 466.16, 587.33];

  private context: AudioContext | null = null;
  private unlocked = false;
  private masterGain: GainNode | null = null;

  private bgmGain: GainNode | null = null;
  private bgmOscillators: OscillatorNode[] = [];
  private bgmInterval: number | null = null;
  private bgmPlaying = false;
  private bgmDrumTimeout: number | null = null;

  constructor() {
    const onInteraction = () => {
      void this.tryResume();
    };
    window.addEventListener('pointerdown', onInteraction);
    window.addEventListener('keydown', onInteraction);
    window.addEventListener('click', onInteraction);
  }

  /** Create AudioContext if needed and try to resume it. Safe to call anytime. */
  private async ensureContext(): Promise<AudioContext | null> {
    if (this.context) {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      return this.context;
    }
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.context.destination);
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      this.startAmbience();
      this.unlocked = true;
      return this.context;
    } catch {
      return null;
    }
  }

  /** Try to resume an existing suspended AudioContext (called on user interaction). */
  private async tryResume(): Promise<void> {
    if (!this.context || this.context.state !== 'suspended') return;
    try {
      await this.context.resume();
      if (!this.unlocked) {
        this.unlocked = true;
        this.startAmbience();
      }
    } catch {
      /* browser may still block autoplay */
    }
  }

  private startAmbience(): void {
    if (!this.context) return;
    const scheduleBird = () => {
      if (!this.context || this.context.state !== 'running') return;
      this.birdChirp();
      const delay = 3000 + Math.random() * 8000;
      setTimeout(scheduleBird, delay);
    };
    scheduleBird();
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

  // --- Japanese-style BGM ---

  startBGM(level: number): void {
    void this.ensureContext().then(() => {
      if (this.context && !this.bgmPlaying) {
        this.doStartBGM(level);
      }
    });
  }

  private doStartBGM(level: number): void {
    if (!this.context || this.bgmPlaying) return;
    this.bgmPlaying = true;

    this.bgmGain = this.context.createGain();
    this.bgmGain.gain.value = 0.5;
    this.bgmGain.connect(this.masterGain!);

    const bpm = Math.min(60 + Math.floor((level - 1) / 5) * 5, 80);
    const beatDuration = 60 / bpm;
    let beatIndex = 0;

    // Bass drone (shō-like)
    const drone = this.context.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = this.IN_SEN[0] / 2;
    const droneGain = this.context.createGain();
    droneGain.gain.value = 0.3;
    drone.connect(droneGain);
    droneGain.connect(this.bgmGain);
    drone.start();
    this.bgmOscillators.push(drone);

    // Koto arpeggios
    const playKoto = () => {
      if (!this.context || !this.bgmPlaying) return;
      const now = this.context.currentTime;
      for (let i = 0; i < 3; i++) {
        const t = now + i * beatDuration * 0.5;
        const noteIdx = (beatIndex + i * 2) % this.IN_SEN.length;
        const freq = this.IN_SEN[noteIdx] * (1 + 0.01 * (noteIdx % 3));

        const koto = this.context.createOscillator();
        koto.type = 'sine';
        koto.frequency.setValueAtTime(freq, t);
        koto.frequency.exponentialRampToValueAtTime(freq * 1.002, t + 0.3);

        const kotoGain = this.context.createGain();
        kotoGain.gain.setValueAtTime(0, t);
        kotoGain.gain.linearRampToValueAtTime(0.3, t + 0.005);
        kotoGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

        koto.connect(kotoGain);
        kotoGain.connect(this.bgmGain!);
        koto.start(t);
        koto.stop(t + 0.6);
      }
      beatIndex++;
    };

    // Shakuhachi melody
    const playShakuhachi = () => {
      if (!this.context || !this.bgmPlaying) return;
      const now = this.context.currentTime;
      const noteIdx = (beatIndex * 2 + 1) % this.IN_SEN.length;
      const freq = this.IN_SEN[noteIdx];

      const shaku = this.context.createOscillator();
      shaku.type = 'triangle';
      shaku.frequency.setValueAtTime(freq, now);
      shaku.frequency.linearRampToValueAtTime(freq * 1.03, now + 0.15);
      shaku.frequency.linearRampToValueAtTime(freq * 0.98, now + 0.4);

      const shakuGain = this.context.createGain();
      shakuGain.gain.setValueAtTime(0, now);
      shakuGain.gain.linearRampToValueAtTime(0.25, now + 0.04);
      shakuGain.gain.linearRampToValueAtTime(0.15, now + 0.2);
      shakuGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq * 2;
      filter.Q.value = 1;

      shaku.connect(filter).connect(shakuGain);
      shakuGain.connect(this.bgmGain!);
      shaku.start(now);
      shaku.stop(now + 1);
    };

    // Taiko drum
    const playTaiko = () => {
      if (!this.context || !this.bgmPlaying) return;
      const now = this.context.currentTime;

      const taiko = this.context.createOscillator();
      taiko.type = 'sine';
      taiko.frequency.setValueAtTime(60, now);
      taiko.frequency.exponentialRampToValueAtTime(30, now + 0.2);

      const taikoGain = this.context.createGain();
      taikoGain.gain.setValueAtTime(0, now);
      taikoGain.gain.linearRampToValueAtTime(0.4, now + 0.01);
      taikoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      taiko.connect(taikoGain);
      taikoGain.connect(this.bgmGain!);
      taiko.start(now);
      taiko.stop(now + 0.5);

      const body = this.context.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(80, now);
      body.frequency.exponentialRampToValueAtTime(55, now + 0.3);

      const bodyGain = this.context.createGain();
      bodyGain.gain.setValueAtTime(0, now);
      bodyGain.gain.linearRampToValueAtTime(0.25, now + 0.01);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      body.connect(bodyGain);
      bodyGain.connect(this.bgmGain!);
      body.start(now);
      body.stop(now + 0.5);
    };

    const scheduleLoop = () => {
      if (!this.context || !this.bgmPlaying) return;

      playKoto();

      if (beatIndex % 4 === 0) {
        playShakuhachi();
      }

      if (beatIndex % 2 === 0) {
        playTaiko();
        if (beatIndex % 4 === 0) {
          this.bgmDrumTimeout = window.setTimeout(() => {
            if (this.context && this.bgmPlaying) {
              const lightT = this.context.currentTime;
              const lt = this.context.createOscillator();
              lt.type = 'sine';
              lt.frequency.setValueAtTime(80, lightT);
              lt.frequency.exponentialRampToValueAtTime(50, lightT + 0.1);
              const lg = this.context.createGain();
              lg.gain.setValueAtTime(0, lightT);
              lg.gain.linearRampToValueAtTime(0.25, lightT + 0.005);
              lg.gain.exponentialRampToValueAtTime(0.0001, lightT + 0.2);
              lt.connect(lg);
              lg.connect(this.bgmGain!);
              lt.start(lightT);
              lt.stop(lightT + 0.3);
            }
          }, beatDuration * 500);
        }
      }

      beatIndex++;
      this.bgmInterval = window.setTimeout(scheduleLoop, beatDuration * 1000);
    };

    scheduleLoop();
  }

  stopBGM(): void {
    this.bgmPlaying = false;
    if (this.bgmInterval !== null) {
      clearTimeout(this.bgmInterval);
      this.bgmInterval = null;
    }
    if (this.bgmDrumTimeout !== null) {
      clearTimeout(this.bgmDrumTimeout);
      this.bgmDrumTimeout = null;
    }
    for (const osc of this.bgmOscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    this.bgmOscillators = [];
    this.bgmGain = null;
  }

  // --- Event SFX ---

  private playSfx(fn: (ctx: AudioContext, master: GainNode) => void): void {
    if (this.context && this.context.state === 'running') {
      fn(this.context, this.masterGain!);
    } else {
      // Try to create/resume context and play
      void this.ensureContext().then((ctx) => {
        if (ctx && ctx.state === 'running' && this.masterGain) {
          fn(ctx, this.masterGain);
        }
      });
    }
  }

  feed(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  deerHappy(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.08;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400 + i * 100, t);
        osc.frequency.exponentialRampToValueAtTime(600 + i * 100, t + 0.06);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.05, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + 0.15);
      }
    });
  }

  victory(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const notes = [523, 659, 784, 1047];
      for (let i = 0; i < notes.length; i++) {
        const t = now + i * 0.2;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = notes[i];
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + 0.6);
      }
    });
  }

  levelUp(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const scale = [this.IN_SEN[0], this.IN_SEN[1], this.IN_SEN[2], this.IN_SEN[3], this.IN_SEN[4], this.IN_SEN[5]];
      for (let i = 0; i < scale.length; i++) {
        const t = now + i * 0.1;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(scale[i], t);
        osc.frequency.linearRampToValueAtTime(scale[i] * 1.01, t + 0.15);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.07, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + 0.4);
      }
      const chordTime = now + scale.length * 0.1;
      for (let j = 0; j < 3; j++) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = this.IN_SEN[j * 2] * 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, chordTime);
        g.gain.linearRampToValueAtTime(0.06, chordTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, chordTime + 1.0);
        osc.connect(g).connect(master);
        osc.start(chordTime);
        osc.stop(chordTime + 1.2);
      }
    });
  }

  templeBell(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 110;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 165;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 3);
      osc2.stop(now + 3);
    });
  }

  error(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  splash(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  angryDeer(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 80;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  coin(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 + i * 400, now + i * 0.04);
        osc.frequency.exponentialRampToValueAtTime(1800 + i * 400, now + i * 0.04 + 0.05);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.06, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.1);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.12);
      }
    });
  }

  buyCracker(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.3;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2000;
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      source.connect(filter).connect(gain);
      gain.connect(master);
      source.start(now);
    });
  }

  heartbeat(_intensity: number): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 40;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.15);
    });
  }

  adComplete(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600 + i * 200, now + i * 0.06);
        osc.frequency.exponentialRampToValueAtTime(800 + i * 200, now + i * 0.06 + 0.08);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.05, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.15);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.2);
      }
    });
  }

  jump(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.15);
    });
  }

  dash(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.5;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      source.connect(filter).connect(gain);
      gain.connect(master);
      source.start(now);
    });
  }

  chestOpen(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(400, now);
      osc1.frequency.exponentialRampToValueAtTime(200, now + 0.15);
      const g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.04, now);
      g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc1.connect(g1);
      g1.connect(master);
      osc1.start(now);
      osc1.stop(now + 0.25);

      const chimeTime = now + 0.15;
      for (let i = 0; i < 3; i++) {
        const t = chimeTime + i * 0.06;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800 + i * 200, t);
        osc.frequency.exponentialRampToValueAtTime(1200 + i * 200, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.25);
      }
    });
  }

  secret(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const sNotes = [880, 1100, 1320, 1760];
      for (let i = 0; i < sNotes.length; i++) {
        const t = now + i * 0.04;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(sNotes[i], t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.04, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.2);
      }
    });
  }

  pickup(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.2);
    });
  }

  uiClick(): void {
    this.playSfx((ctx, master) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.05);
    });
  }

  dispose(): void {
    this.stopBGM();
    void this.context?.close();
    this.context = null;
  }
}
