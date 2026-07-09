# 奈良喂鹿 · 游戏音频设计文档（ADD）

> 配套 `src/systems/AudioSystem.ts`（实现）与 `src/game/Game.ts`（集成点）。
> 版本 v1.0 · 2026-07-10
> 设计支柱引用 `DESIGN.md`：治愈感优先 / 鞠躬即高潮 / 传播即生存 / 渐进解锁。

---

## 〇、为什么这样设计音频（Audio as a System, not SFX）

这个游戏是 **Three.js 网页游戏**，没有 Unity/Unreal 运行时，因此 **FMOD / Wwise 不是自然选择**（网页里硬塞中间件既重又别扭）。但"中间件思维"——**事件抽象、总线路由、声音预算、参数驱动的自适应音乐、3D 空间化、混响分区**——正是专业音频工程的纪律。本设计把这些纪律落到 **Web Audio API** 上：它是这个引擎的原生音频层，零资源下载、内存几乎为零，且能程序化合成日式乐器音色（琴/尺八/太鼓），完美契合"网页 + 治愈"的定位。

一句话：**不引入沉重中间件，但用中间件的架构标准来做。**

---

## 一、声学身份（Sonic Identity）

用三个形容词定义这个游戏"应该听起来像什么"。所有音色、混音、编曲决策都以此为准绳：

1. **治愈（Healing）**——温润、留白、不拥挤。音量保守，中低频铺底，高频不刺耳。
2. **古雅（Timeless / Miyabi）**——日本传统音阶（都節/陰音階 In-scale）、琴与尺八的质感、神社钟声。时间感模糊，像在奈良公园的午后。
3. **灵动（Alive）**——风声、鸟鸣、鹿铃般的细节持续在场；喂食瞬间的粒子感反馈密集而轻盈。

> **反例（明确禁止）**：电子舞曲底鼓四四拍、西方大调颂歌式胜利、任何制造焦虑的刺耳音。这些会破坏治愈支柱。

---

## 二、玩法状态 → 音频响应映射

音频必须对"玩家此刻在经历什么"做出反应。下表是状态到音频的映射（实现见 `AudioSystem` 事件表）。

| 玩法状态 | 音频反应 | 设计意图 |
|----------|----------|----------|
| 探索（无鹿邻近） | `explore` 相位：稀疏琴琶音 + 风/鸟环境 | 留白、治愈、不催促 |
| 鹿靠近/鞠躬/喂食中 | `social` 相位：叠加尺八旋律 | "被需要、被信任"的暖意（支柱2） |
| 暴躁鹿冲撞（charging） | `alert` 相位 + Tension↑：太鼓轻击、亮度略降 | 温和紧张，不恐怖——这是个治愈游戏 |
| 金钱吃紧（<100円） | Tension 轻微抬升 | 用声音暗示"该规划仙贝了" |
| 喂食成功 | 爱心粒子 + `SFX/Player/Feed`（升调铃音，空间化于鹿位） | 每次喂食都像"被治愈一次" |
| 鹿开心 | `SFX/Deer/Happy`（三连跳音，空间化于鹿位） | 情绪价值核心载体 |
| 通关/升级 | `Music/Sting/Victory` + `Music/Sting/LevelUp` | 丰盛奖励反馈 |
| 调戏鹿生气 | `SFX/Deer/Angry`（低吼，空间化） | 后果是"玩家选择"，非经济惩罚 |
| 落水 | `SFX/Env/Splash`（水声，空间化于玩家） | 风险反馈 |
| 开宝箱 / 拾币 | `SFX/Env/ChestOpen` / `SFX/Pickup/Coin`（空间化于物体） | 发现感 |
| 神社修复 | `Env/TempleBell`（钟声，空间化于神社，混响区=神社） | 文化锚点 + 混响分区示范 |
| 买仙贝 / UI 点击 / 错误 | `SFX/Pickup/Senbei` / `SFX/UI/Click` / `SFX/UI/Error` | 零延迟 UI 反馈（PCM 等价：直接合成、不流式） |

---

## 三、自适应音乐参数架构（Adaptive Music）

BGM 不是一首写死的曲子，而是由 **相位（Phase）** 与 **张力（Tension）** 两个参数实时塑形的系统。

### 3.1 Phase（离散状态，来自玩法状态机）
| Phase | 触发条件（Game.ts 每帧计算） | 音乐层 |
|-------|--------------------------------|--------|
| `explore` | 默认；6m 内无鹿处于 Bow/Eating/Happy/Approach | 琴琶音 + 环境 |
| `social` | 邻近鹿处于上述"互动"状态 | + 尺八旋律（暖） |
| `alert` | 暴躁鹿 charging 邻近 | + 太鼓轻击、亮度略降 |
| `celebrate` | 预留（胜利/升级 sting 期间可用） | 短暂丰盈 swell |

> 相位切换通过总线增益 **0.5s 斜坡过渡**，玩家"只感觉到"，不会听到硬切。

### 3.2 Tension（连续 0.0–1.0，来自玩法聚合）
- **来源**：暴躁鹿 `charging` 邻近度（上限 0.6，距离 12m 衰减到 0）+ 金钱 <100円（0.12）。每帧在 `Game.ts` 聚合后 `setTension()`。
- **更新**：每帧传入，**BGM 调度器内 lerp 平滑**（约 0.1/拍），避免抖动。
- **作用**：
  - 太鼓密度/强度随 Tension 增加；
  - `bgmFilter` 亮度随 Tension 从 18kHz（t=0）降到 6kHz（t=1）——紧张时"蒙一层"但不脏；
  - 尺八存在感随 Tension 增强。
- **量化**：节拍由 `setTimeout` 调度（BPM 随关卡 60→80），层切换对齐到拍点，无 mid-bar 硬切。

### 3.3 永远可听的"中性层"
`explore` 相位（琴 + 风/鸟）可无限循环而不疲劳——这是治愈游戏的底色，任何张力状态都从它之上叠加，而非替换它。

---

## 四、总线与 VCA 结构（Bus / Routing）

```
                                  ┌─> limiter (DynamicsCompressor, 防削波)
master gain (0.85) ─────────────┤
   │                              └─> destination
   ├─ bgm  bus ─> bgmFilter(亮度: Tension 驱动) ─┐
   ├─ sfx  bus ─────────────────────────────────────┤
   ├─ ui   bus ─────────────────────────────────────┤──> master
   └─ ambience bus ─────────────────────────────────┤
                                                     │
   sfx bus ─> reverbSend(gain=zone.wet) ─> convolver(合成IR) ─┘
```

- **limiter** 放在 master 之后、destination 之前，作为削波安全带（网页音频尤需，因设备增益各异）。
- **bgmFilter** 是 Tension→亮度的单一控制点（一处改动全局生效）。
- **reverbSend** 把世界空间 SFX 送入卷积混响；干声仍直连 master，构成标准 send 结构。
- **UI 总线独立**：UI 音零延迟、最高优先级、永不抢占——哪怕 24 个 SFX 同时响，按钮声也一定出。

### 声音预算（Voice Budget）
| 总线 | 最大同时声部 | 优先级/抢占策略 |
|------|---------------|----------------|
| sfx  | 24 | 按事件优先级；超预算抢占"最不重要且最旧"的声部 |
| ui   | 8  | 优先级 0（最高），**永不抢占** |
| ambience | 6 | 环境细节上限，防鸟鸣堆叠爆音 |
| bgm  | （持续层，单独管理） | 振荡器持久节点，不计入瞬态预算 |

> 实现见 `AudioSystem.voice()` + `steal()`：每个瞬态声部登记 `{bus, priority, stopAt, stop}`，超预算时挑 `priority > 新声部` 且最旧者 `stop()` 真切断（无咔哒的短包络已天然缓冲）。治愈游戏宁可"盖掉旧的"也不让新反馈丢失。

---

## 五、3D 空间化与混响分区（Spatial Audio）

这是个 3D 游戏，**所有世界空间（diegetic）音效必须用 PannerNode(HRTF) 空间化**——绝不等于 2D。听者（listener）每帧绑定相机世界坐标 + 朝向（Game.ts `setListener`）。

### 5.1 衰减（Attenuation）
- refDistance 2m（满音量起算）
- maxDistance 40m（不可闻）
- distanceModel `inverse`，rolloff 1.1（写实对数感）
- 世界事件：喂食/鹿叫/拾币/开箱/落水/神社钟 → 传入世界坐标

### 5.2 遮挡（Occlusion）
- 参数 `occlusion` (0=开放, 1=全遮挡) 驱动一个 **low-pass** 截止频率：1.0 时约 300Hz（闷），0 时全通。
- 当前由游戏系统按"玩家与声源间是否有障碍"计算后传入 `play(name, pos, {occlusion})`。（集成点已留好接口，遮挡射线可在后续接入 `CollisionSystem`。）

### 5.3 混响分区（Reverb Zones）
用**合成脉冲响应（IR）**的卷积混响，按区域切换——奈良公园的"室外"和"神社木造建筑"听感必须不同：

| 区域 | IR 时长 | 衰减 | Wet% | 触发 |
|------|---------|------|-------|------|
| outdoor | 0.25s | 2.0 | 12% | 默认（公园） |
| indoor | 1.4s | 3.0 | 32% | 预留（建筑内） |
| temple | 2.4s | 3.0 | 50% | 玩家距神社 <14m |
| cave | 3.5s | 2.5 | 60% | 预留（洞穴/下水道） |

> 切换通过 `reverbSend.gain.setTargetAtTime(..., 0.3s)` 平滑，且 IR 仅在区域变化时重建（防每帧开销）。

---

## 六、事件命名与调度规范（Event Convention）

所有音效通过**命名事件**触发，游戏代码不持有任何资源路径（符合"音频逻辑在音频层"原则）：

```
event:/[Category]/[Subcategory]/[EventName]

SFX/Player/Feed        SFX/Player/Jump      SFX/Player/Dash
SFX/Deer/Happy         SFX/Deer/Angry       SFX/Deer/Heartbeat
SFX/Pickup/Coin        SFX/Pickup/Senbei
SFX/Env/Splash         SFX/Env/ChestOpen    Env/TempleBell
SFX/UI/Click           SFX/UI/Error         SFX/UI/Secret   SFX/UI/AdComplete  SFX/UI/Pickup
Music/Sting/Victory    Music/Sting/LevelUp
```

- **API**：`audio.play('SFX/Deer/Happy', deerPos)` 自动判定 2D/3D、选总线、走 voice 预算。
- **兼容**：保留 `audio.feed()` / `audio.dash()` 等旧方法签名（位置参数可选，缺省时落在听者处），`Game.ts` 无需大规模改写。
- **调试 HUD**：`audio.debugInfo()` 返回 `{voices, phase, tension, zone}`，可接到开发者模式 overlay。

---

## 七、SFX 事件总表（音效设计简报）

每个事件给出"音色意图 + 合成方式 + 优先级"。全部为程序化合成（无音频文件）。

| 事件 | 音色意图 | 合成方式 | 优先级 |
|------|----------|----------|--------|
| `SFX/Player/Feed` | 升调清脆铃音（"投喂成功"） | sine 880→1320, 0.4s | 1 |
| `SFX/Deer/Happy` | 三连跳音（开心蹦跶） | triangle ×3 错拍 400/500/600→上滑 | 2 |
| `SFX/Deer/Angry` | 低沉喉音（被调戏生气） | sine 80Hz, 0.3s | 1 |
| `SFX/Deer/Heartbeat` | 极低频脉动（危机潜意识） | sine 40Hz, 0.15s | 3 |
| `SFX/Pickup/Coin` | 双音上滑"叮叮" | sine 1200/1600 滑音 | 2 |
| `SFX/Pickup/Senbei` | 短促"咔"买仙贝 | 噪声 bandpass 2k, 0.05s | 2 |
| `SFX/Env/Splash` | 落水"扑通" | sine 200→80, 0.4s | 2 |
| `SFX/Env/ChestOpen` | 开箱"吱呀+铃" | sine 400→200 + 三铃 | 2 |
| `Env/TempleBell` | 神社钟（长尾混响） | sine 110 + 165 谐波, 3s 指数衰减 | 2 |
| `SFX/Player/Jump` | 轻快上滑 | sine 300→600, 0.12s | 2 |
| `SFX/Player/Dash` | 风噪"嗖" | 噪声 bandpass 800→200, 0.2s | 2 |
| `SFX/UI/Click` | 零延迟极短"嗒" | sine 1000, 0.04s | 0（永不抢占） |
| `SFX/UI/Error` | 下行方波"噗"（温柔不刺） | square 150→100, 0.2s | 0 |
| `SFX/UI/Secret` | 神秘四音上行 | sine 880→1760, 0.15s | 1 |
| `SFX/UI/AdComplete` | 完成三音 | triangle ×3, 0.2s | 1 |
| `SFX/UI/Pickup` | 通用拾取上滑 | triangle 600→900, 0.15s | 1 |
| `Music/Sting/Victory` | 四音大调式上行（仍用 In 音阶） | sine 523/659/784/1047 | 0 |
| `Music/Sting/LevelUp` | 音阶琶音 + 低八度共鸣和弦 | sine 琶音 + triangle 和弦 | 0 |

### 环境（Ambience，常驻）
- **风声**：2s 噪声缓冲经 lowpass(300)+highpass(80)，由 0.05Hz 正弦调制增益形成"阵风"。
- **鸟鸣**：每 3–11s 随机一声，2–4kHz 正弦快速上滑，增益极低（0.04）——"灵动"的来源。

### BGM 乐器（程序化）
- **琴（koto）**：sine + 极微失谐 + 快速 attack/长指数释放，弹拨感。
- **尺八（shakuhachi）**：triangle + bandpass，滑音微颤（用 In 音阶）。
- **太鼓（taiko）**：sine 60→30 体鸣 + 80→55 共鸣，短促。
- **持续低音（shō 感）**：sine 半频持续铺底。
- **音阶**：In-scale（陰音階）D, Eb, G, A, Bb, D —— 日本传统"幽玄"听感，天然治愈。

---

## 八、集成点（Game.ts）

`Game.update(delta, elapsed)` 每帧调用（已在现有 `audio.*` 调用之外新增）：

```ts
// 1) 听者绑定相机
this.audio.setListener(cameraWorldPos, cameraForward);

// 2) 张力：暴躁鹿 charging 邻近 + 金钱紧张
let t = 0;
for (const d of this.deerList)
  if (d.aggressiveState === 'charging')
    t = Math.max(t, 0.6 * Math.max(0, 1 - d.group.position.distanceTo(pp) / 12));
if (this.money < 100) t = Math.max(t, 0.12);
this.audio.setTension(t);

// 3) 混响分区：神社邻近 → temple
this.audio.setReverbZone(nearTemple ? 'temple' : 'outdoor');

// 4) 相位：邻近鹿处于互动状态 → social
this.audio.setPhase(nearbySocial ? 'social' : 'explore');
```

世界事件传入坐标以触发空间化：`feed(deerPos)`、`deerHappy(deerPos)`、`coin(pos)`、`chestOpen(pos)`、`splash(playerPos)`。

---

## 九、成功指标（与 `GameAudioEngineer` 标准对齐）

- [x] 所有世界空间 SFX 经 PannerNode 空间化（非 2D）
- [x] 每个总线有 voice 上限与抢占策略（无默认无限制）
- [x] 音乐过渡相位对齐拍点、0.5s 斜坡，玩家"只感觉到"
- [x] 混响区域随环境切换（室外 ↔ 神社）
- [x] 内存近乎零（全程序化合成，无音频文件下载）
- [ ] 后续：遮挡射线接入 `CollisionSystem` 真实计算 occlusion
- [ ] 后续：A/B 两套自适应编曲在浏览器内热切换对比
- [ ] 后续：开发者 HUD overlay 显示 voices/phase/tension/zone
```
