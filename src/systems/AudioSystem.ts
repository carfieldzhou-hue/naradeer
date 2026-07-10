/**
 * AudioSystem — 奈良喂鹿游戏的互动音频层。
 *
 * 这是 Web 网页游戏（Three.js），没有 Unity/Unreal 运行时，因此不引入 FMOD/Wwise
 * 这类原生中间件；但本文件用 **中间件的架构纪律** 在 Web Audio API 上实现：
 *   - 总线/限制器路由（master → {bgm, sfx, ui, ambience} → limiter → destination）
 *   - 基于优先级的 voice 预算与抢占（每总线声部上限）
 *   - 3D 空间化（PannerNode / HRTF）用于世界空间（diegetic）事件
 *   - 混响分区（合成卷积脉冲响应 IR）
 *   - 由 Phase + Tension 参数驱动的自适应 BGM
 * 所有 SFX 均为程序化合成（零音频文件下载，内存近乎为零），契合网页 + 治愈定位。
 */

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type AudioPhase = 'explore' | 'social' | 'alert' | 'celebrate';
export type AudioBus = 'bgm' | 'sfx' | 'ui' | 'ambience';
export type ReverbZone = 'outdoor' | 'indoor' | 'temple' | 'cave';

/** 最小位置接口，刚好满足 Web Audio listener / panner 的需要（与 THREE.Vector3 结构兼容）。 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type StopNode = { stop: (when?: number) => void };
interface SynthResult {
  dur: number;
  nodes: StopNode[];
}
type SfxSynth = (ctx: AudioContext, dest: AudioNode) => SynthResult;

/** 旋律ノート（d=音階度数[-1=間/休符], dur=拍数, oct=オクターブ, bend=oshi/meri 技法） */
interface MelodyNote {
  d: number;
  dur: number;
  oct: number;
  bend?: number;
}

interface Voice {
  bus: AudioBus;
  priority: number; // 0 = 最高重要度
  stopAt: number; // ctx 时间
  stop: () => void;
}

// ---------------------------------------------------------------------------
// 静态配置（声音预算 / 混响分区 / 事件元数据）
// ---------------------------------------------------------------------------

/** 每总线最大同时瞬态声部（"声音预算"）。bgm 为持续层，单独管理。 */
const BUS_VOICE_CAP: Record<AudioBus, number> = {
  bgm: 999,
  sfx: 24,
  ui: 8,
  ambience: 6,
};

interface ReverbProfile {
  duration: number; // IR 秒数
  decay: number; // 衰减指数
  wet: number; // 湿声比例
}
const REVERB_PROFILES: Record<ReverbZone, ReverbProfile> = {
  outdoor: { duration: 0.25, decay: 2.0, wet: 0.12 },
  indoor: { duration: 1.4, decay: 3.0, wet: 0.32 },
  temple: { duration: 2.4, decay: 3.0, wet: 0.5 },
  cave: { duration: 3.5, decay: 2.5, wet: 0.6 },
};

/** 需要 3D 空间化的事件（其余按 2D 处理）。 */
const SPATIAL_EVENTS = new Set<string>([
  'SFX/Player/Feed',
  'SFX/Deer/Happy',
  'SFX/Deer/Angry',
  'SFX/Deer/Heartbeat',
  'SFX/Pickup/Coin',
  'SFX/Pickup/Senbei',
  'SFX/Env/Splash',
  'SFX/Env/ChestOpen',
  'SFX/Player/Jump',
  'SFX/Player/Dash',
  'Env/TempleBell',
]);

/** 事件优先级（0 最高；用于超预算时抢占判定）。 */
const PRIORITY: Record<string, number> = {
  'SFX/UI/Click': 0,
  'SFX/UI/Error': 0,
  'Music/Sting/Victory': 0,
  'Music/Sting/LevelUp': 0,
  'SFX/Player/Feed': 1,
  'SFX/Deer/Angry': 1,
  'SFX/UI/Secret': 1,
  'SFX/UI/AdComplete': 1,
  'SFX/UI/Pickup': 1,
  'SFX/Deer/Happy': 2,
  'SFX/Deer/Heartbeat': 3,
  'SFX/Pickup/Coin': 2,
  'SFX/Pickup/Senbei': 2,
  'SFX/Env/Splash': 2,
  'SFX/Env/ChestOpen': 2,
  'SFX/Player/Jump': 2,
  'SFX/Player/Dash': 2,
  'Env/TempleBell': 2,
};

// ---------------------------------------------------------------------------
// AudioSystem
// ---------------------------------------------------------------------------

export class AudioSystem {
  // 日本伝統音階 — 複数音階を切替て反復疲労を防ぐ
  /** 陰音階（In sen）— 暗い六音音階：D, Eb, G, A, Bb, D — レベルアップ fanfare 用 */
  private readonly IN_SEN = [293.66, 311.13, 392.0, 440.0, 466.16, 587.33];
  /** 平調子（Hirajoshi）— 筝の基本音階：D, Eb, G, A, C, D — 治癒・探索・社交・警戒 */
  private readonly HIRAJOSHI = [293.66, 311.13, 392.0, 440.0, 523.25, 587.33];
  /** 呂音階（Ritsu）— 明るい五音音階：D, E, G, A, C, D — 祝賀 */
  private readonly RITSU = [293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

  /** 楽句バンク — A-B-A 呼応構造、間（ma）を含む、8 拍周期 */
  private readonly PHRASES_EXPLORE: MelodyNote[][] = [
    [{ d: 0, dur: 1, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 1, dur: 0.5, oct: 0 }, { d: 0, dur: 1, oct: 0, bend: 0.02 }, { d: -1, dur: 1, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: 2, dur: 1, oct: 0, bend: 0.015 }, { d: -1, dur: 2, oct: 0 }],
    [{ d: 5, dur: 1, oct: 0 }, { d: 3, dur: 1, oct: 0, bend: 0.02 }, { d: 2, dur: 0.5, oct: 0 }, { d: 1, dur: 0.5, oct: 0 }, { d: 0, dur: 2, oct: 0, bend: 0.03 }, { d: -1, dur: 2, oct: 0 }],
    [{ d: -1, dur: 1, oct: 0 }, { d: 2, dur: 1, oct: 0 }, { d: 3, dur: 1.5, oct: 0, bend: 0.03 }, { d: 4, dur: 0.5, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: -1, dur: 1, oct: 0 }, { d: 0, dur: 2, oct: 0, bend: 0.02 }],
    [{ d: 0, dur: 0.5, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 0, dur: 0.5, oct: 0 }, { d: 1, dur: 1, oct: 0 }, { d: 0, dur: 1, oct: 0, bend: 0.02 }, { d: -1, dur: 3, oct: 0 }],
  ];

  private readonly PHRASES_SOCIAL: MelodyNote[][] = [
    [{ d: 0, dur: 0.5, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 3, dur: 0.5, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 0, dur: 1, oct: 0 }, { d: 3, dur: 0.5, oct: 0 }, { d: 4, dur: 0.5, oct: 0 }, { d: 5, dur: 2, oct: 0, bend: 0.02 }, { d: -1, dur: 2, oct: 0 }],
    [{ d: 5, dur: 0.5, oct: 0 }, { d: 4, dur: 0.5, oct: 0 }, { d: 3, dur: 0.5, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 1, dur: 0.5, oct: 0 }, { d: 0, dur: 2, oct: 0, bend: 0.025 }, { d: -1, dur: 2, oct: 0 }],
    [{ d: 0, dur: 1, oct: 0 }, { d: 3, dur: 0.5, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: 4, dur: 1, oct: 0, bend: 0.02 }, { d: 5, dur: 1, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: -1, dur: 2, oct: 0 }],
  ];

  private readonly PHRASES_CELEBRATE: MelodyNote[][] = [
    [{ d: 0, dur: 0.5, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 4, dur: 0.5, oct: 0 }, { d: 5, dur: 0.5, oct: 0 }, { d: 4, dur: 0.5, oct: 0 }, { d: 3, dur: 0.5, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 0, dur: 0.5, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: 0, dur: 1, oct: 0, bend: 0.02 }, { d: -1, dur: 2, oct: 0 }],
    [{ d: 5, dur: 0.5, oct: 0 }, { d: 4, dur: 0.5, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: 2, dur: 0.5, oct: 0 }, { d: 0, dur: 0.5, oct: 0 }, { d: 2, dur: 1, oct: 0 }, { d: 3, dur: 1, oct: 0 }, { d: 5, dur: 2, oct: 0, bend: 0.02 }, { d: -1, dur: 1, oct: 0 }],
  ];

  private readonly PHRASES_ALERT: MelodyNote[][] = [
    [{ d: 0, dur: 0.5, oct: 0 }, { d: -1, dur: 0.5, oct: 0 }, { d: 0, dur: 0.5, oct: 0 }, { d: -1, dur: 0.5, oct: 0 }, { d: 1, dur: 1, oct: 0 }, { d: -1, dur: 1, oct: 0 }, { d: 0, dur: 1, oct: 0, bend: 0.03 }, { d: -1, dur: 3, oct: 0 }],
    [{ d: 0, dur: 0.5, oct: -1 }, { d: 0, dur: 0.5, oct: 0 }, { d: 1, dur: 0.5, oct: 0 }, { d: 0, dur: 0.5, oct: 0 }, { d: -1, dur: 1, oct: 0 }, { d: 2, dur: 1, oct: 0, bend: 0.02 }, { d: -1, dur: 4, oct: 0 }],
  ];

  private context: AudioContext | null = null;
  private unlocked = false;

  // 总线（在 ensureContext 中创建）
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private busGain!: Record<AudioBus, GainNode>;
  private bgmFilter!: BiquadFilterNode; // Tension → 亮度 的单一控制点
  private convolver!: ConvolverNode;
  private reverbSend!: GainNode;

  // 空间听者
  private listenerPos: Vec3 = { x: 0, y: 0, z: 0 };
  private listenerUp: Vec3 = { x: 0, y: 1, z: 0 };

  // 自适应状态
  private phase: AudioPhase = 'explore';
  private tension = 0; // 已平滑
  private tensionTarget = 0; // 玩法系统写入

  // 混响分区
  private currentZone: ReverbZone = 'outdoor';

  // 声部追踪
  private voices: Voice[] = [];

  // BGM 调度句柄
  private bgmOscillators: OscillatorNode[] = [];
  private bgmInterval: number | null = null;
  private bgmPlaying = false;

  // 事件合成器登记表（命名事件 → 合成器）
  private sfxRegistry: Record<string, SfxSynth> = {};

  constructor() {
    const onInteraction = (): void => {
      void this.tryResume();
    };
    window.addEventListener('pointerdown', onInteraction);
    window.addEventListener('keydown', onInteraction);
    window.addEventListener('click', onInteraction);

    // 绑定所有命名事件
    this.sfxRegistry = {
      'SFX/Player/Feed': this.synFeed,
      'SFX/Deer/Happy': this.synDeerHappy,
      'SFX/Deer/Angry': this.synAngryDeer,
      'SFX/Deer/Heartbeat': this.synHeartbeat,
      'SFX/Pickup/Coin': this.synCoin,
      'SFX/Pickup/Senbei': this.synBuyCracker,
      'SFX/Env/Splash': this.synSplash,
      'SFX/Env/ChestOpen': this.synChestOpen,
      'SFX/Player/Jump': this.synJump,
      'SFX/Player/Dash': this.synDash,
      'Env/TempleBell': this.synTempleBell,
      'SFX/UI/Click': this.synUiClick,
      'SFX/UI/Error': this.synError,
      'SFX/UI/Secret': this.synSecret,
      'SFX/UI/AdComplete': this.synAdComplete,
      'SFX/UI/Pickup': this.synPickup,
      'Music/Sting/Victory': this.synVictory,
      'Music/Sting/LevelUp': this.synLevelUp,
    };
  }

  // -------------------------------------------------------------------------
  // 上下文与总线构建
  // -------------------------------------------------------------------------

  /** 创建 AudioContext（如需要）并尝试恢复。可随时安全调用。 */
  private async ensureContext(): Promise<AudioContext | null> {
    if (this.context) {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      return this.context;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx: AudioContext = new AC();
      this.context = ctx;

      // master + 限制器（削波安全带）
      this.master = ctx.createGain();
      this.master.gain.value = 0.85;
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.master.connect(this.limiter);
      this.limiter.connect(ctx.destination);

      // 总线
      this.busGain = {
        bgm: ctx.createGain(),
        sfx: ctx.createGain(),
        ui: ctx.createGain(),
        ambience: ctx.createGain(),
      };
      this.busGain.sfx.gain.value = 0.9;
      this.busGain.ui.gain.value = 1.0;
      this.busGain.ambience.gain.value = 0.5;
      this.busGain.bgm.gain.value = 0.5;
      this.busGain.sfx.connect(this.master);
      this.busGain.ui.connect(this.master);
      this.busGain.ambience.connect(this.master);

      // BGM 亮度滤波（Tension 驱动）
      this.bgmFilter = ctx.createBiquadFilter();
      this.bgmFilter.type = 'lowpass';
      this.bgmFilter.frequency.value = 18000;
      this.bgmFilter.Q.value = 0.7;
      this.bgmFilter.connect(this.master);
      this.busGain.bgm.connect(this.bgmFilter);

      // 混响（合成 IR 卷积）
      this.convolver = ctx.createConvolver();
      const prof = REVERB_PROFILES[this.currentZone];
      this.convolver.buffer = this.makeImpulse(prof.duration, prof.decay);
      this.convolver.connect(this.master);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = prof.wet;
      this.reverbSend.connect(this.convolver);
      // 世界 SFX 送入混响
      this.busGain.sfx.connect(this.reverbSend);

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      this.startAmbience();
      this.unlocked = true;
      return ctx;
    } catch {
      return null;
    }
  }

  /** 用户交互后尝试恢复已挂起的上下文。 */
  private async tryResume(): Promise<void> {
    if (!this.context || this.context.state !== 'suspended') return;
    try {
      await this.context.resume();
      if (!this.unlocked) {
        this.unlocked = true;
        this.startAmbience();
      }
    } catch {
      /* 浏览器仍可能阻止自动播放 */
    }
  }

  // -------------------------------------------------------------------------
  // 环境声（常驻）
  // -------------------------------------------------------------------------

  private startAmbience(): void {
    const ctx = this.context;
    if (!ctx) return;
    const scheduleBird = (): void => {
      if (!this.context || this.context.state !== 'running') return;
      this.birdChirp();
      const delay = 3000 + Math.random() * 8000;
      window.setTimeout(scheduleBird, delay);
    };
    scheduleBird();
    this.windAmbience();
  }

  private windAmbience(): void {
    const ctx = this.context;
    if (!ctx) return;
    const bufferSize = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.03;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 300;
    lpf.Q.value = 1;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 80;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    // 阵风调制
    const gustOsc = ctx.createOscillator();
    gustOsc.type = 'sine';
    gustOsc.frequency.value = 0.05;
    const gustGain = ctx.createGain();
    gustGain.gain.value = 0.5;
    gustOsc.connect(gustGain);
    gustGain.connect(gain.gain);
    source.connect(lpf).connect(hpf).connect(gain).connect(this.busGain.ambience);
    gustOsc.start();
    source.start();
  }

  private birdChirp(): void {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = 2000 + Math.random() * 2000;
    const duration = 0.05 + Math.random() * 0.1;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.busGain.ambience);
    osc.start(now);
    osc.stop(now + duration + 0.1);
  }

  // -------------------------------------------------------------------------
  // 合成基础单元
  // -------------------------------------------------------------------------

  /** 单振荡器音粒：可滑音、短包络（天然防咔哒）。 */
  private blip(
    ctx: AudioContext,
    dest: AudioNode,
    f0: number,
    f1: number | null,
    dur: number,
    peak: number,
    type: OscillatorType = 'sine',
  ): SynthResult {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1 !== null && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    return { dur, nodes: [osc] };
  }

  /** 噪声爆破（滤波）：用于水/风/买仙贝等质感音。 */
  private noiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    dur: number,
    freq: number,
    filterType: BiquadFilterType,
    peak: number,
    slideTo?: number,
  ): SynthResult {
    const now = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, now);
    if (slideTo !== undefined) {
      f.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    }
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(now);
    src.stop(now + dur + 0.02);
    return { dur, nodes: [src] };
  }

  // -------------------------------------------------------------------------
  // 事件合成器（命名事件实现）
  // -------------------------------------------------------------------------

  private synFeed = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 880, 1320, 0.4, 0.08, 'sine');

  private synDeerHappy = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const nodes: StopNode[] = [];
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400 + i * 100, t);
      osc.frequency.exponentialRampToValueAtTime(600 + i * 100, t + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.15);
      nodes.push(osc);
    }
    return { dur: 0.35, nodes };
  };

  private synAngryDeer = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 80, null, 0.3, 0.12, 'sine');

  private synHeartbeat = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 40, null, 0.15, 0.06, 'sine');

  private synCoin = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const nodes: StopNode[] = [];
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.04;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 + i * 400, t);
      osc.frequency.exponentialRampToValueAtTime(1800 + i * 400, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.12);
      nodes.push(osc);
    }
    return { dur: 0.14, nodes };
  };

  private synBuyCracker = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.noiseBurst(ctx, dest, 0.05, 2000, 'bandpass', 0.06);

  private synSplash = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 200, 80, 0.4, 0.1, 'sine');

  private synChestOpen = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const nodes: StopNode[] = [];
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(400, now);
    o1.frequency.exponentialRampToValueAtTime(200, now + 0.15);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.04, now);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    o1.connect(g1).connect(dest);
    o1.start(now);
    o1.stop(now + 0.25);
    nodes.push(o1);
    for (let i = 0; i < 3; i++) {
      const t = now + 0.15 + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800 + i * 200, t);
      osc.frequency.exponentialRampToValueAtTime(1200 + i * 200, t + 0.04);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.25);
      nodes.push(osc);
    }
    return { dur: 0.5, nodes };
  };

  private synJump = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 300, 600, 0.12, 0.04, 'sine');

  private synDash = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.noiseBurst(ctx, dest, 0.2, 800, 'bandpass', 0.06, 200);

  private synTempleBell = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 110;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 165;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3);
    osc.connect(g);
    osc2.connect(g);
    g.connect(dest);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 3);
    osc2.stop(now + 3);
    return { dur: 3, nodes: [osc, osc2] };
  };

  private synUiClick = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 1000, null, 0.04, 0.03, 'sine');

  private synError = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 150, 100, 0.2, 0.08, 'square');

  private synSecret = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const nodes: StopNode[] = [];
    const notes = [880, 1100, 1320, 1760];
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * 0.04;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.2);
      nodes.push(osc);
    }
    return { dur: 0.2, nodes };
  };

  private synAdComplete = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const nodes: StopNode[] = [];
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600 + i * 200, t);
      osc.frequency.exponentialRampToValueAtTime(800 + i * 200, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.2);
      nodes.push(osc);
    }
    return { dur: 0.25, nodes };
  };

  private synPickup = (ctx: AudioContext, dest: AudioNode): SynthResult =>
    this.blip(ctx, dest, 600, 900, 0.15, 0.04, 'triangle');

  private synVictory = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const nodes: StopNode[] = [];
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * 0.2;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.6);
      nodes.push(osc);
    }
    return { dur: 0.7, nodes };
  };

  private synLevelUp = (ctx: AudioContext, dest: AudioNode): SynthResult => {
    const now = ctx.currentTime;
    const nodes: StopNode[] = [];
    const scale = this.IN_SEN;
    for (let i = 0; i < scale.length; i++) {
      const t = now + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(scale[i], t);
      osc.frequency.linearRampToValueAtTime(scale[i] * 1.01, t + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.4);
      nodes.push(osc);
    }
    const chordTime = now + scale.length * 0.1;
    for (let j = 0; j < 3; j++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = scale[j * 2] * 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, chordTime);
      g.gain.linearRampToValueAtTime(0.06, chordTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, chordTime + 1.0);
      osc.connect(g).connect(dest);
      osc.start(chordTime);
      osc.stop(chordTime + 1.2);
      nodes.push(osc);
    }
    return { dur: scale.length * 0.1 + 1.2, nodes };
  };

  // -------------------------------------------------------------------------
  // 声部预算（voice budget）与抢占
  // -------------------------------------------------------------------------

  private voiceCount(bus: AudioBus): number {
    let n = 0;
    for (const v of this.voices) if (v.bus === bus) n++;
    return n;
  }

  private pruneVoices(now: number): void {
    if (this.voices.length === 0) return;
    this.voices = this.voices.filter((v) => v.stopAt > now);
  }

  /** 抢占：在同一总线挑"更不重要（priority 更大）且最旧"的声部真正切断。 */
  private steal(bus: AudioBus, incomingPriority: number): void {
    let victim: Voice | null = null;
    for (const v of this.voices) {
      if (v.bus !== bus) continue;
      if (v.priority <= incomingPriority) continue; // 永不抢占更重要者
      if (!victim || v.stopAt < victim.stopAt) victim = v;
    }
    if (victim) {
      victim.stop();
      const i = this.voices.indexOf(victim);
      if (i >= 0) this.voices.splice(i, 1);
    }
  }

  /** 登记并播放一个瞬态声部，服从总线预算与抢占。 */
  private spawn(bus: AudioBus, priority: number, dest: AudioNode, synth: SfxSynth): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    this.pruneVoices(ctx.currentTime);
    if (this.voiceCount(bus) >= BUS_VOICE_CAP[bus]) {
      this.steal(bus, priority);
    }
    const { dur, nodes } = synth(ctx, dest);
    const v: Voice = {
      bus,
      priority,
      stopAt: ctx.currentTime + dur,
      stop: () => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            /* 已停止 */
          }
        }
      },
    };
    this.voices.push(v);
  }

  // -------------------------------------------------------------------------
  // 空间化（3D PannerNode / HRTF）
  // -------------------------------------------------------------------------

  /** 构建一个空间化声源节点，并接到 sfx 总线 + 混响发送。返回应连接合成器的入口节点。 */
  private makePanner(pos: Vec3, occlusion: number): AudioNode {
    const ctx = this.context!;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2;
    panner.maxDistance = 40;
    panner.rolloffFactor = 1.1;

    const anyP = panner as unknown as {
      positionX?: AudioParam;
      positionY?: AudioParam;
      positionZ?: AudioParam;
      setPosition?: (x: number, y: number, z: number) => void;
    };
    const t = ctx.currentTime;
    if (anyP.positionX && anyP.positionY && anyP.positionZ) {
      anyP.positionX.setValueAtTime(pos.x, t);
      anyP.positionY.setValueAtTime(pos.y, t);
      anyP.positionZ.setValueAtTime(pos.z, t);
    } else if (anyP.setPosition) {
      anyP.setPosition(pos.x, pos.y, pos.z);
    }

    panner.connect(this.busGain.sfx);
    panner.connect(this.reverbSend);

    if (occlusion > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800 - occlusion * (800 - 300); // 全遮挡≈300Hz（闷）
      lp.connect(panner);
      return lp;
    }
    return panner;
  }

  // -------------------------------------------------------------------------
  // 混响（合成 IR）
  // -------------------------------------------------------------------------

  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.context!;
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * duration));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  // -------------------------------------------------------------------------
  // 公共 API：命名事件调度
  // -------------------------------------------------------------------------

  /**
   * 播放一个命名事件。世界空间事件（见 SPATIAL_EVENTS）会在 pos 处空间化；
   * pos 缺省时落于听者处。音频逻辑全在此层，游戏代码不持有任何资源路径。
   */
  play(name: string, pos?: Vec3, opts?: { occlusion?: number }): void {
    if (!this.context) {
      // 尚未创建上下文：在用户手势内创建后重放一次
      void this.ensureContext().then(() => this.play(name, pos, opts));
      return;
    }
    if (this.context.state !== 'running') return; // 挂起中，等待手势

    const synth = this.sfxRegistry[name];
    if (!synth) {
      console.warn('[audio] 未知事件:', name);
      return;
    }
    const bus: AudioBus = name.startsWith('SFX/UI/') ? 'ui' : 'sfx';
    const dest = SPATIAL_EVENTS.has(name)
      ? this.makePanner(pos ?? this.listenerPos, opts?.occlusion ?? 0)
      : this.busGain[bus];
    const priority = PRIORITY[name] ?? 2;
    this.spawn(bus, priority, dest, synth);
  }

  // 便捷方法（保留旧签名；位置参数可选，缺省落在听者处）
  feed(pos?: Vec3): void {
    this.play('SFX/Player/Feed', pos);
  }
  deerHappy(pos?: Vec3): void {
    this.play('SFX/Deer/Happy', pos);
  }
  angryDeer(pos?: Vec3): void {
    this.play('SFX/Deer/Angry', pos);
  }
  heartbeat(_intensity = 0): void {
    this.play('SFX/Deer/Heartbeat');
  }
  coin(pos?: Vec3): void {
    this.play('SFX/Pickup/Coin', pos);
  }
  buyCracker(pos?: Vec3): void {
    this.play('SFX/Pickup/Senbei', pos);
  }
  splash(pos?: Vec3): void {
    this.play('SFX/Env/Splash', pos);
  }
  chestOpen(pos?: Vec3): void {
    this.play('SFX/Env/ChestOpen', pos);
  }
  jump(pos?: Vec3): void {
    this.play('SFX/Player/Jump', pos);
  }
  dash(pos?: Vec3): void {
    this.play('SFX/Player/Dash', pos);
  }
  templeBell(pos?: Vec3): void {
    this.play('Env/TempleBell', pos);
  }
  victory(): void {
    this.play('Music/Sting/Victory');
  }
  levelUp(): void {
    this.play('Music/Sting/LevelUp');
  }
  error(): void {
    this.play('SFX/UI/Error');
  }
  adComplete(): void {
    this.play('SFX/UI/AdComplete');
  }
  secret(): void {
    this.play('SFX/UI/Secret');
  }
  pickup(): void {
    this.play('SFX/UI/Pickup');
  }
  uiClick(): void {
    this.play('SFX/UI/Click');
  }

  // -------------------------------------------------------------------------
  // 公共 API：自适应参数与听者
  // -------------------------------------------------------------------------

  /** 每帧绑定听者（相机世界坐标 + 朝向），供 3D 空间化使用。 */
  setListener(pos: Vec3, forward: Vec3, up?: Vec3): void {
    this.listenerPos = pos;
    if (up) this.listenerUp = up;
    const ctx = this.context;
    if (!ctx) return;
    const l = ctx.listener as unknown as {
      positionX?: AudioParam;
      positionY?: AudioParam;
      positionZ?: AudioParam;
      forwardX?: AudioParam;
      forwardY?: AudioParam;
      forwardZ?: AudioParam;
      upX?: AudioParam;
      upY?: AudioParam;
      upZ?: AudioParam;
      setPosition?: (x: number, y: number, z: number) => void;
      setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
    };
    const t = ctx.currentTime;
    const u = up ?? this.listenerUp;
    if (l.positionX && l.positionY && l.positionZ &&
        l.forwardX && l.forwardY && l.forwardZ &&
        l.upX && l.upY && l.upZ) {
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(u.x, t);
      l.upY.setValueAtTime(u.y, t);
      l.upZ.setValueAtTime(u.z, t);
    } else {
      l.setPosition?.(pos.x, pos.y, pos.z);
      l.setOrientation?.(forward.x, forward.y, forward.z, u.x, u.y, u.z);
    }
  }

  /** 设置目标张力（0–1），由玩法系统每帧写入；BGM 调度器内做平滑。 */
  setTension(t: number): void {
    this.tensionTarget = Math.max(0, Math.min(1, t));
  }

  /** 设置音乐相位（探索/社交/警戒/庆祝），切换经 0.5s 增益斜坡过渡。 */
  setPhase(p: AudioPhase): void {
    if (p === this.phase) return;
    this.phase = p;
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime;
    const target = p === 'celebrate' ? 0.62 : p === 'social' ? 0.55 : 0.5;
    const g = this.busGain.bgm.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(target, t + 0.5);
  }

  /** 设置混响分区（室外/室内/神社/洞穴），切换经 0.3s 平滑且仅在变化时重建 IR。 */
  setReverbZone(z: ReverbZone): void {
    if (z === this.currentZone) return;
    this.currentZone = z;
    const ctx = this.context;
    if (!ctx) return;
    const p = REVERB_PROFILES[z];
    this.convolver.buffer = this.makeImpulse(p.duration, p.decay);
    this.reverbSend.gain.setTargetAtTime(p.wet, ctx.currentTime, 0.3);
  }

  /** 开发者诊断信息（可接到 HUD overlay）。 */
  debugInfo(): { voices: number; phase: AudioPhase; tension: number; zone: ReverbZone; bgm: boolean } {
    return {
      voices: this.voices.length,
      phase: this.phase,
      tension: this.tension,
      zone: this.currentZone,
      bgm: this.bgmPlaying,
    };
  }

  // -------------------------------------------------------------------------
  // 自適応 BGM — 京都伝統様式（琴/三味線/尺八/太鼓/笙 + 楽句ベース scheduling + 間）
  // -------------------------------------------------------------------------

  startBGM(level: number): void {
    void this.ensureContext().then(() => {
      if (this.context && !this.bgmPlaying) {
        this.doStartBGM(level);
      }
    });
  }

  private doStartBGM(level: number): void {
    const ctx = this.context;
    if (!ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;

    const bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.45;
    bgmGain.connect(this.bgmFilter);
    this.busGain.bgm = bgmGain;

    // 京都雅楽のゆったりしたテンポ — 関所ごとに微増
    const bpm = Math.min(48 + Math.floor((level - 1) / 5) * 3, 64);
    const beat = 60 / bpm;
    let phraseIdx = 0;

    // 笙（shō）持続ドローン — 伝統的な和音クラスター + うなり
    this.startShoDrone();

    const schedulePhrase = (): void => {
      if (!this.context || !this.bgmPlaying) return;

      // 張力 smoothing
      this.tension += (this.tensionTarget - this.tension) * 0.08;
      const now = this.context.currentTime;
      const tn = this.tension;

      // 明るさ = 張力に反応（高張力で暗く）
      this.bgmFilter.frequency.setTargetAtTime(18000 - tn * 12000, now, 0.15);

      // 楽句選択 — phase に応じた bank から順次
      const bank = this.currentPhraseBank();
      const phrase = bank[phraseIdx % bank.length];

      // 琴旋律を scheduling — 楽句の各ノートを先行スケジュール
      let beatOffset = 0;
      for (const note of phrase) {
        if (note.d >= 0) {
          this.playKotoNote(now + beatOffset * beat, this.noteFreq(note.d, note.oct), note.dur * beat, note.bend ?? 0);
        }
        beatOffset += note.dur;
      }

      // 三味線の呼応 — social/celebrate で奇数番目の楽句後に応答フレーズ
      if ((this.phase === 'social' || this.phase === 'celebrate') && phraseIdx % 2 === 1) {
        const response = bank[(phraseIdx + 1) % bank.length];
        let respOffset = 0;
        for (const note of response) {
          if (note.d >= 0) {
            this.playShamisenNote(now + respOffset * beat, this.noteFreq(note.d, note.oct + 1), note.dur * beat);
          }
          respOffset += note.dur;
        }
      }

      // 太鼓 — alert / 高張力で拍点に配置
      if (this.phase === 'alert' || tn > 0.35) {
        this.playTaiko(now);
        this.playTaiko(now + 4 * beat);
        if (tn > 0.6) {
          this.playTaiko(now + 2 * beat);
          this.playTaiko(now + 6 * beat);
        }
      }

      // 尺八 — 偶発的・表現的な間奏（explore/social で確率発生）
      if ((this.phase === 'explore' || this.phase === 'social') && Math.random() < 0.35) {
        const scale = this.currentScale;
        const noteIdx = 2 + Math.floor(Math.random() * 3);
        this.playShakuhachiNote(now + (beatOffset + 1) * beat, scale[noteIdx], beat * 3);
        beatOffset += 4;
      }

      // 次の楽句までの間（ma）— 2 拍の呼吸
      phraseIdx++;
      const totalBeats = beatOffset + 2;
      this.bgmInterval = window.setTimeout(schedulePhrase, totalBeats * beat * 1000);
    };
    schedulePhrase();
  }

  /** 現在の phase に応じた音階を返す */
  private get currentScale(): number[] {
    if (this.phase === 'celebrate') return this.RITSU;
    return this.HIRAJOSHI;
  }

  /** 現在の phase に応じた楽句バンクを返す */
  private currentPhraseBank(): MelodyNote[][] {
    switch (this.phase) {
      case 'alert': return this.PHRASES_ALERT;
      case 'celebrate': return this.PHRASES_CELEBRATE;
      case 'social': return this.PHRASES_SOCIAL;
      default: return this.PHRASES_EXPLORE;
    }
  }

  /** 音階度数 + オクターブ → 周波数 */
  private noteFreq(degree: number, oct: number): number {
    const scale = this.currentScale;
    const idx = ((degree % scale.length) + scale.length) % scale.length;
    return scale[idx] * Math.pow(2, oct + Math.floor(degree / scale.length));
  }

  // --- 笙（shō）持続ドローン ---

  private startShoDrone(): void {
    const ctx = this.context;
    if (!ctx) return;
    const base = this.currentScale[0] / 2;
    // 笙の伝統的な和音クラスター（根音、五度、八度、長三度、十二度）
    const intervals = [1, 1.5, 2, 2.52, 3.01];
    for (const interval of intervals) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * interval * (1 + (Math.random() - 0.5) * 0.004);
      const g = ctx.createGain();
      g.gain.value = 0.05;
      // うなり効果（beating）— ゆっくりした振幅変調で笙特有の揺らぎ
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.4 + Math.random() * 1.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(this.busGain.bgm);
      osc.start();
      lfo.start();
      this.bgmOscillators.push(osc, lfo);
    }
  }

  // --- 琴（koto）---

  private playKotoNote(now: number, freq: number, dur: number, bend: number): void {
    const ctx = this.context;
    if (!ctx) return;

    // 撥弦アタック — 極短ノイズバースト（爪で弦を弾く瞬間）
    const aLen = Math.max(1, Math.floor(ctx.sampleRate * 0.004));
    const aBuf = ctx.createBuffer(1, aLen, ctx.sampleRate);
    const aData = aBuf.getChannelData(0);
    for (let i = 0; i < aLen; i++) aData[i] = (Math.random() * 2 - 1) * (1 - i / aLen);
    const aSrc = ctx.createBufferSource();
    aSrc.buffer = aBuf;
    const aFilter = ctx.createBiquadFilter();
    aFilter.type = 'highpass';
    aFilter.frequency.value = freq * 1.5;
    const aGain = ctx.createGain();
    aGain.gain.value = 0.12;
    aSrc.connect(aFilter).connect(aGain).connect(this.busGain.bgm);
    aSrc.start(now);

    // 琴体 — 正弦波 + oshi（押し：ゆっくり音程を上げる伝統技法）
    const koto = ctx.createOscillator();
    koto.type = 'sine';
    koto.frequency.setValueAtTime(freq * (1 - bend * 0.6), now);
    koto.frequency.linearRampToValueAtTime(freq, now + 0.08 + bend * 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    koto.connect(g).connect(this.busGain.bgm);
    koto.start(now);
    koto.stop(now + dur + 0.1);

    // 共鳴弦 — 2 倍音、遅延入り（同道弦の共鳴）
    const res = ctx.createOscillator();
    res.type = 'sine';
    res.frequency.value = freq * 2.001;
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0, now + 0.015);
    rGain.gain.linearRampToValueAtTime(0.06, now + 0.025);
    rGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.7);
    res.connect(rGain).connect(this.busGain.bgm);
    res.start(now + 0.015);
    res.stop(now + dur);
  }

  // --- 三味線（shamisen）---

  private playShamisenNote(now: number, freq: number, dur: number): void {
    const ctx = this.context;
    if (!ctx) return;

    // 胴体 — 鋸歯波（明るい倍音を持つ弦楽器音色）
    const body = ctx.createOscillator();
    body.type = 'sawtooth';
    body.frequency.value = freq;

    // 共鳴フィルター — 三味線特有の胴鳴り
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq * 1.8;
    filter.Q.value = 4;

    // さわり（sawari）— 微妙な振幅変調で「ブーン」という唸り
    const buzz = ctx.createOscillator();
    buzz.type = 'sine';
    buzz.frequency.value = 42;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.08;
    buzz.connect(buzzGain);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.1, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    buzzGain.connect(g.gain);

    body.connect(filter).connect(g).connect(this.busGain.bgm);
    body.start(now);
    buzz.start(now);
    body.stop(now + dur + 0.1);
    buzz.stop(now + dur + 0.1);
  }

  // --- 尺八（shakuhachi）---

  private playShakuhachiNote(now: number, freq: number, dur: number): void {
    const ctx = this.context;
    if (!ctx) return;

    // 本体 — 正弦波 + meri（メリ：音程を下げる伝統技法）
    const shaku = ctx.createOscillator();
    shaku.type = 'sine';
    shaku.frequency.setValueAtTime(freq, now);
    shaku.frequency.linearRampToValueAtTime(freq * 0.96, now + dur * 0.25);
    shaku.frequency.linearRampToValueAtTime(freq * 0.98, now + dur * 0.55);

    // 息雑音 — バンドパスフィルタを通したホワイトノイズ
    const bLen = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const bBuf = ctx.createBuffer(1, bLen, ctx.sampleRate);
    const bData = bBuf.getChannelData(0);
    for (let i = 0; i < bLen; i++) bData[i] = Math.random() * 2 - 1;
    const bSrc = ctx.createBufferSource();
    bSrc.buffer = bBuf;
    const bFilter = ctx.createBiquadFilter();
    bFilter.type = 'bandpass';
    bFilter.frequency.value = freq * 2.5;
    bFilter.Q.value = 1.5;
    const bGain = ctx.createGain();
    bGain.gain.setValueAtTime(0, now);
    bGain.gain.linearRampToValueAtTime(0.035, now + dur * 0.12);
    bGain.gain.linearRampToValueAtTime(0.015, now + dur * 0.5);
    bGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    bSrc.connect(bFilter).connect(bGain).connect(this.busGain.bgm);

    // 音色エンベロープ — ゆっくりしたアタック（息吹き込み）
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16, now + dur * 0.12);
    g.gain.linearRampToValueAtTime(0.12, now + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    shaku.connect(g).connect(this.busGain.bgm);
    shaku.start(now);
    bSrc.start(now);
    shaku.stop(now + dur + 0.1);
    bSrc.stop(now + dur + 0.1);
  }

  // --- 太鼓（taiko）---

  private playTaiko(now: number): void {
    const ctx = this.context;
    if (!ctx) return;

    // 打撃 — 短ノイズ + ローパス（皮を叩く瞬間）
    const iLen = Math.max(1, Math.floor(ctx.sampleRate * 0.015));
    const iBuf = ctx.createBuffer(1, iLen, ctx.sampleRate);
    const iData = iBuf.getChannelData(0);
    for (let i = 0; i < iLen; i++) iData[i] = (Math.random() * 2 - 1) * (1 - i / iLen);
    const iSrc = ctx.createBufferSource();
    iSrc.buffer = iBuf;
    const iFilter = ctx.createBiquadFilter();
    iFilter.type = 'lowpass';
    iFilter.frequency.value = 350;
    const iGain = ctx.createGain();
    iGain.gain.value = 0.22;
    iSrc.connect(iFilter).connect(iGain).connect(this.busGain.bgm);
    iSrc.start(now);

    // 胴体 — 正弦波ピッチスイープ
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(88, now);
    body.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    const bGain = ctx.createGain();
    bGain.gain.setValueAtTime(0, now);
    bGain.gain.linearRampToValueAtTime(0.32, now + 0.004);
    bGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    body.connect(bGain).connect(this.busGain.bgm);
    body.start(now);
    body.stop(now + 0.45);

    // 殻鳴り — 高域倍音
    const shell = ctx.createOscillator();
    shell.type = 'sine';
    shell.frequency.setValueAtTime(190, now);
    shell.frequency.exponentialRampToValueAtTime(115, now + 0.18);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0, now);
    sGain.gain.linearRampToValueAtTime(0.1, now + 0.004);
    sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    shell.connect(sGain).connect(this.busGain.bgm);
    shell.start(now);
    shell.stop(now + 0.35);
  }

  stopBGM(): void {
    this.bgmPlaying = false;
    if (this.bgmInterval !== null) {
      clearTimeout(this.bgmInterval);
      this.bgmInterval = null;
    }
    for (const osc of this.bgmOscillators) {
      try {
        osc.stop();
      } catch {
        /* 已停止 */
      }
    }
    this.bgmOscillators = [];
  }

  // -------------------------------------------------------------------------
  // 释放
  // -------------------------------------------------------------------------

  dispose(): void {
    this.stopBGM();
    void this.context?.close();
    this.context = null;
  }
}
