# 奈良公园 — 手机适配·难度·变现 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造现有 Three.js 奈良公园喂鹿游戏，实现手机 UI 适配、逐关难度递增、鹿性格系统、非付费变现（广告+分享）、日式 BGM 与音效。

**Architecture:** 在现有 Game/Player/Deer/AudioSystem/Park/Hud 架构上扩展，新增 AdSystem 模块，不改变核心游戏循环。所有新功能通过条件分支兼容 L1（教学关）。

**Tech Stack:** TypeScript, Three.js, Web Audio API, CSS Media Queries

## Global Constraints
- 所有音效用 Web Audio API 程序化生成，不依赖外部音频文件
- 兼容现有桌面体验，CSS 媒体查询切换手机布局
- L1 始终保持教学关难度（无惩罚、无倒计时、温顺鹿为主）
- 鹿性格与 index 绑定，保持确定性（和稀有度、性别一致）
- 广告先用模拟实现（setTimeout 倒计时），预留真实 SDK 接口
- 分享每关限 1 次，广告每关限次（见具体设计）

---

### Task 1: 修复分享按钮

**Files:**
- Modify: `src/game/Game.ts:468-497`

**Interfaces:**
- Consumes: `Hud.showToast(msg: string)`, `AudioSystem.feed()`
- Produces: 修复后的 `doShare()` 方法，新增 `tryClipboardShare()` 和 `fallbackShare()` 私有方法

- [ ] **Step 1: 重写 doShare() 方法**

修改 `src/game/Game.ts` 中的 `doShare()`：

```typescript
doShare(): void {
    if (this.shareUsedThisLevel || this.levelComplete) return;
    const url = window.location.href;
    const text = '来奈良公园喂鹿吧！我正在挑战第 ' + this.currentLevel + ' 关！\n' + url;

    const shareSuccess = () => {
      this.rewardShare();
      this.hud.showToast('分享成功！获得 100 円 🎉');
    };

    // 立即反馈
    this.hud.showToast('正在准备分享…');

    // 优先 Web Share API（手机原生分享面板）
    if (navigator.share) {
      navigator.share({ title: '奈良公园 - 喂鹿游戏', text, url })
        .then(shareSuccess)
        .catch(() => {
          this.tryClipboardShare(text, shareSuccess);
        });
    } else {
      this.tryClipboardShare(text, shareSuccess);
    }
  }
```

- [ ] **Step 2: 添加后备方法**

在 `rewardShare()` 之前添加：

```typescript
private tryClipboardShare(text: string, onSuccess: () => void): void {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        this.fallbackShare(text, onSuccess);
      });
    } else {
      this.fallbackShare(text, onSuccess);
    }
  }

private fallbackShare(text: string, onSuccess: () => void): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      onSuccess();
    } catch {
      this.hud.showToast('复制链接失败，请手动分享此页面 🙏');
    }
    document.body.removeChild(textarea);
  }
```

- [ ] **Step 3: 验证构建**

```bash
npx vite build
```
Expected: 构建成功，无错误

- [ ] **Step 4: 提交**

```bash
git add src/game/Game.ts
git commit -m "fix: Reorder share flow — Web Share API优先, add clipboard fallback"
```

---

### Task 2: 新增音效 + BGM（AudioSystem 扩展）

**Files:**
- Modify: `src/systems/AudioSystem.ts`
- Modify: `src/game/Game.ts`（连接 BGM 启动）

**Interfaces:**
- Consumes: 无（独立模块）
- Produces:
  - `AudioSystem.startBGM(level: number)` — 启动关卡特有 BGM
  - `AudioSystem.stopBGM()` — 停止 BGM
  - `AudioSystem.splash()` — 落水音效
  - `AudioSystem.angryDeer()` — 鹿怒音效
  - `AudioSystem.coin()` — 金币碰撞
  - `AudioSystem.buyCracker()` — 购买仙贝
  - `AudioSystem.heartbeat(intensity: number)` — 倒计时脉冲
  - `AudioSystem.adComplete()` — 广告完成

- [ ] **Step 1: 在 AudioSystem 中添加 BGM 字段和五声音阶常量**

在类顶部添加：

```typescript
// 日本五声音阶（都节音阶）频率
private readonly PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00]; // C D E G A

private bgmGain: GainNode | null = null;
private bgmOscillators: OscillatorNode[] = [];
private bgmInterval: number | null = null;
private bgmPlaying = false;
```

- [ ] **Step 2: 实现 startBGM()**

```typescript
startBGM(level: number): void {
    if (!this.context || this.bgmPlaying) return;
    this.bgmPlaying = true;

    // BGM master gain
    this.bgmGain = this.context.createGain();
    this.bgmGain.gain.value = 0.08;
    this.bgmGain.connect(this.masterGain!);

    // 主旋律（尺八模拟）：三角波 + 低通
    const melody = this.context.createOscillator();
    melody.type = 'triangle';
    const melodyFilter = this.context.createBiquadFilter();
    melodyFilter.type = 'lowpass';
    melodyFilter.frequency.value = 800;
    melody.connect(melodyFilter);
    melodyFilter.connect(this.bgmGain);

    // 伴奏（筝模拟）：正弦波 + 颤音
    const harmony = this.context.createOscillator();
    harmony.type = 'sine';
    const harmonyGain = this.context.createGain();
    harmonyGain.gain.value = 0.04;
    harmony.connect(harmonyGain);
    harmonyGain.connect(this.bgmGain);

    // 太鼓节奏：低频噪声脉冲
    const drumGain = this.context.createGain();
    drumGain.gain.value = 0.05;
    drumGain.connect(this.bgmGain);

    this.bgmOscillators = [melody, harmony];
    melody.start();
    harmony.start();

    // 音符序列（随机漫步五声音阶）
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
      // 鼓点：每 4 拍一下
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
```

- [ ] **Step 3: 实现 stopBGM()**

```typescript
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
```

- [ ] **Step 4: 实现新增音效方法**

```typescript
splash(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    // 扑通：低频正弦波 + 噪声
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
    // 低频太鼓鼓点
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
    // 短促高音 + 泛音
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
    // 酥脆感：滤波噪声短爆发
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
    const freq = 0.5 + intensity * 0.5; // intensity 0-1
    // 低频脉冲
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
    // 欢快上升音
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
```

- [ ] **Step 5: 在生中调用BGM**

修改 `Game.ts` 的 `start()` 方法，在游戏开始时启动 BGM：
```typescript
start(): void {
    this.audio.startBGM(this.currentLevel);
    this.loop.start();
}
```

修改 `Game.ts` 的 `goToNextLevel()` 方法，在切换关卡时更新 BGM：
```typescript
this.audio.stopBGM();
this.audio.startBGM(this.currentLevel);
```

修改 `dispose()` 方法，停止 BGM：
```typescript
dispose(): void {
    this.audio.stopBGM();
    // ... existing dispose ...
}
```

- [ ] **Step 6: 验证构建**

```bash
npx vite build
```
Expected: 构建成功

- [ ] **Step 7: 提交**

```bash
git add src/systems/AudioSystem.ts src/game/Game.ts
git commit -m "feat: Add Japanese-style BGM and new SFX (splash, angry, coin, heartbeat)"
```

---

### Task 3: 鹿性格系统

**Files:**
- Modify: `src/entities/Deer.ts`
- Modify: `src/systems/Journal.ts`
- Modify: `src/styles.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: 现有 `DeerRarity`, `RARITY_BY_INDEX`, `GENDER_BY_INDEX`
- Produces:
  - `DeerPersonality` 枚举
  - `PERSONALITY_BY_INDEX` 数组（与 deer index 绑定）
  - `getDeerInfo()` 返回包含 `personality` 字段

- [ ] **Step 1: 在 Deer.ts 中添加性格枚举和映射**

在 `DeerRarity` 枚举后添加：

```typescript
export enum DeerPersonality {
  Gentle = 'gentle',
  Shy = 'shy',
  Curious = 'curious',
  Aloof = 'aloof',
  Aggressive = 'aggressive',
}

// 性格权重分布（与 index 绑定，确定性）
const PERSONALITY_BY_INDEX: DeerPersonality[] = [
  DeerPersonality.Gentle,    // 0
  DeerPersonality.Curious,   // 1
  DeerPersonality.Gentle,    // 2
  DeerPersonality.Shy,       // 3
  DeerPersonality.Gentle,    // 4
  DeerPersonality.Curious,   // 5
  DeerPersonality.Gentle,    // 6
  DeerPersonality.Shy,       // 7
  DeerPersonality.Aloof,     // 8
  DeerPersonality.Gentle,    // 9
  DeerPersonality.Curious,   // 10
  DeerPersonality.Shy,       // 11
  DeerPersonality.Aloof,     // 12
  DeerPersonality.Aggressive, // 13
  DeerPersonality.Gentle,    // 14
  DeerPersonality.Shy,       // 15
];
```

- [ ] **Step 2: 在 Deer 类中添加 personality 字段和 getter**

在构造函数中添加：
```typescript
readonly personality = PERSONALITY_BY_INDEX[this.index];
```

添加 `Personality中文名` 映射：
```typescript
function getPersonalityLabel(p: DeerPersonality): string {
  const labels: Record<DeerPersonality, string> = {
    [DeerPersonality.Gentle]: '温顺',
    [DeerPersonality.Shy]: '害羞',
    [DeerPersonality.Curious]: '好奇',
    [DeerPersonality.Aloof]: '高冷',
    [DeerPersonality.Aggressive]: '暴躁',
  };
  return labels[p];
}
```

- [ ] **Step 3: 扩展 getDeerInfo()**

```typescript
getDeerInfo(): DeerInfo {
    return {
      index: this.index,
      name: getDeerName(this.index),
      rarity: getDeerRarity(this.index),
      personality: this.personality,
      personalityLabel: getPersonalityLabel(this.personality),
      isMale: GENDER_BY_INDEX[this.index],
      hasAntlers: ANTLERS_BY_INDEX[this.index],
      special: getSpecialVariantName(this.index),
    };
}
```

其中 `DeerInfo` 需要新增字段：
```typescript
export interface DeerInfo {
  // ... existing fields ...
  personality: DeerPersonality;
  personalityLabel: string;
}
```

- [ ] **Step 4: 实现性格驱动的行为逻辑**

在 `Deer.update()` 中根据 `this.personality` 分支行为：

```typescript
// 性格行为
switch (this.personality) {
  case DeerPersonality.Gentle:
    // 玩家在 5m 内时主动靠近到 2m
    if (distToPlayer < 5 && state === DeerState.Idle) {
      state = DeerState.Wander;
      target.copy(playerPos).sub(this.group.position).normalize().multiplyScalar(-0.5); // 向玩家移动
      this.targetPos.copy(playerPos);
    }
    break;
  case DeerPersonality.Shy:
    // 玩家在 4m 内时后退保持 3m 距离
    if (distToPlayer < 4 && state === DeerState.Idle) {
      const fleeDir = this.group.position.clone().sub(playerPos).normalize();
      this.targetPos.copy(this.group.position).add(fleeDir.multiplyScalar(3));
    }
    break;
  case DeerPersonality.Curious:
    // 先靠近观察，玩家一动就跑
    if (distToPlayer > 3 && distToPlayer < 6 && state === DeerState.Idle) {
      this.targetPos.copy(playerPos);
    }
    break;
  case DeerPersonality.Aloof:
    // 不主动靠近，玩家到 2.5m 就走开
    if (distToPlayer < 2.5 && state === DeerState.Idle) {
      const away = this.group.position.clone().sub(playerPos).normalize();
      this.targetPos.copy(this.group.position).add(away.multiplyScalar(5));
    }
    break;
  case DeerPersonality.Aggressive:
    // 暴躁行为（见 Step 5）
    break;
}
```

- [ ] **Step 5: 实现暴躁鹿行为**

在 Deer 类中添加字段：
```typescript
private aggressiveState: 'idle' | 'warning' | 'charging' | 'fleeing' = 'idle';
private aggressiveCooldown = 0;
private chargeTarget = new THREE.Vector3();
```

在 `update()` 中暴躁分支：

```typescript
case DeerPersonality.Aggressive:
  if (this.aggressiveCooldown > 0) {
    this.aggressiveCooldown -= delta;
    break;
  }
  switch (this.aggressiveState) {
    case 'idle':
      if (distToPlayer < 3) {
        this.aggressiveState = 'warning';
        // 触发头顶 ❗ 显示（通过状态机）
      }
      break;
    case 'warning':
      if (distToPlayer > 5) {
        this.aggressiveState = 'idle';
      } else if (distToPlayer < 1.5) {
        this.aggressiveState = 'charging';
        this.chargeTarget.copy(playerPos);
      }
      break;
    case 'charging':
      // 直线冲向玩家
      const dir = this.chargeTarget.clone().sub(this.group.position).normalize();
      this.group.position.add(dir.multiplyScalar(4 * delta));
      // 碰撞由 Game.ts 检测
      break;
    case 'fleeing':
      // 跑开 10 米后重置
      if (this.group.position.distanceTo(this.chargeTarget) > 10) {
        this.aggressiveState = 'idle';
        this.aggressiveCooldown = 5;
      }
      break;
  }
  break;
```

- [ ] **Step 6: 在 Game.ts 中添加暴躁鹿碰撞检测**

在 `update()` 循环中，对 `aggressiveState === 'charging'` 的鹿检测与玩家的碰撞：
```typescript
// 暴躁鹿碰撞
for (const deer of this.deerList) {
  if (deer.personality === DeerPersonality.Aggressive && deer.aggressiveState === 'charging') {
    const dist = playerPos.distanceTo(deer.group.position);
    if (dist < 0.5 && this.crackerCount > 0) {
      this.crackerCount--;
      this.audio.angryDeer();
      this.hud.showToast('被暴躁鹿撞到！-1 仙贝 😠');
      // 弹飞玩家
      const pushDir = playerPos.clone().sub(deer.group.position).normalize();
      this.player.group.position.add(pushDir.multiplyScalar(1.5));
      deer.aggressiveState = 'fleeing';
    }
  }
}
```

- [ ] **Step 7: 更新 Journal 显示性格**

在 `Journal.ts` 的卡片渲染中添加性格标签：
```typescript
// 在卡片中添加
const personalityEl = document.createElement('div');
personalityEl.className = 'deer-personality';
personalityEl.textContent = info.personalityLabel;
card.appendChild(personalityEl);
```

- [ ] **Step 8: 验证构建**

```bash
npx vite build
```

- [ ] **Step 9: 提交**

```bash
git add src/entities/Deer.ts src/systems/Journal.ts
git commit -m "feat: Add deer personality system with 5 personality types and aggressive deer behavior"
```

---

### Task 4: 水域惩罚

**Files:**
- Modify: `src/environment/Park.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/game/Game.ts`

**Interfaces:**
- Consumes: `AudioSystem.splash()`, `Park.waterMeshes`
- Produces:
  - `Park.getWaterBounds(): Array<{center: Vector3, radius: number}>`
  - `Player.pushBack(x: number, z: number)` — 弹回玩家

- [ ] **Step 1: Park 公开水体数据**

添加方法：
```typescript
getWaterZones(): Array<{ x: number; z: number; radius: number }> {
    const zones: Array<{ x: number; z: number; radius: number }> = [];
    for (const mesh of this.waterMeshes) {
      const geo = mesh.geometry as THREE.CircleGeometry;
      zones.push({
        x: mesh.position.x,
        z: mesh.position.z,
        radius: geo.parameters.radius || 1,
      });
    }
    return zones;
  }
```

- [ ] **Step 2: Player 添加 pushBack 方法**

```typescript
pushBack(fromX: number, fromZ: number, distance: number): void {
    const dx = this.group.position.x - fromX;
    const dz = this.group.position.z - fromZ;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) {
      this.group.position.x += (dx / len) * distance;
      this.group.position.z += (dz / len) * distance;
    }
  }
```

- [ ] **Step 3: Game.ts 水域碰撞检测**

在 `update()` 中添加（仅在 `currentLevel >= 2` 时生效）：
```typescript
// L2+ 水域惩罚
if (this.currentLevel >= 2 && this.player.isOnGround()) {
  const px = this.player.group.position.x;
  const pz = this.player.group.position.z;
  const waterZones = this.park.getWaterZones();
  for (const zone of waterZones) {
    const dx = px - zone.x;
    const dz = pz - zone.z;
    if (dx * dx + dz * dz < zone.radius * zone.radius) {
      // 惩罚
      if (this.crackerCount > 0) {
        this.crackerCount--;
      } else {
        this.money = Math.max(0, this.money - 50);
      }
      this.player.pushBack(zone.x, zone.z, 1.5);
      this.audio.splash();
      this.hud.showToast(this.crackerCount > 0 ? '掉水里了！-1 仙贝 💧' : '掉水里了！-50 円 💧');
      break; // 每帧只触发一次
    }
  }
}
```

- [ ] **Step 4: 验证构建**

```bash
npx vite build
```

- [ ] **Step 5: 提交**

```bash
git add src/environment/Park.ts src/entities/Player.ts src/game/Game.ts
git commit -m "feat: Add water hazard from L2 — falling into pond costs cracker or money"
```

---

### Task 5: 倒计时系统

**Files:**
- Modify: `src/game/Game.ts`
- Modify: `src/systems/Hud.ts`
- Modify: `index.html`

**Interfaces:**
- Consumes: `AudioSystem.heartbeat()`, `Hud` 现有 `update()` 框架
- Produces:
  - `Game` 新增 `levelTimer` / `levelTimeLimit` 字段
  - `Hud.update()` 新增 `timeLeft` / `timeLimit` 参数控制计时条

- [ ] **Step 1: 在 Hud 中添加计时条 DOM**

在 `index.html` 的 HUD 区域添加：
```html
<div id="timer-bar-container" class="hidden">
  <div id="timer-bar-fill"></div>
</div>
```

- [ ] **Step 2: 在 Hud 类中添加计时条控制**

```typescript
private readonly timerBarContainer = this.getElement('#timer-bar-container');
private readonly timerBarFill = this.getElement('#timer-bar-fill');
```

在 `update()` 中添加参数并处理：
```typescript
// 在参数列表末尾添加 timeLeft?: number, timeLimit?: number
if (timeLeft !== undefined && timeLimit !== undefined && timeLimit > 0) {
  this.timerBarContainer.classList.remove('hidden');
  const pct = Math.max(0, timeLeft / timeLimit * 100);
  this.timerBarFill.style.width = pct + '%';
  // 颜色渐变：绿 → 黄 → 红
  if (pct > 50) {
    this.timerBarFill.style.background = '#4caf50';
  } else if (pct > 25) {
    this.timerBarFill.style.background = '#ff9800';
  } else {
    this.timerBarFill.style.background = '#f44336';
  }
} else {
  this.timerBarContainer.classList.add('hidden');
}
```

- [ ] **Step 3: 在 Game 中添加倒计时逻辑**

添加字段：
```typescript
private levelTimeLimit = 0;
private levelTimer = 0;
```

在 `startLevel()` 中初始化（L3+）：
```typescript
if (this.currentLevel >= 3) {
  this.levelTimeLimit = Math.min(180, 60 + (this.currentLevel - 1) * 15);
  this.levelTimer = this.levelTimeLimit;
} else {
  this.levelTimeLimit = 0;
  this.levelTimer = 0;
}
```

在 `update()` 中：
```typescript
// L3+ 倒计时
if (this.levelTimeLimit > 0 && !this.levelComplete) {
  this.levelTimer -= delta;
  if (this.levelTimer <= 0) {
    this.levelTimer = 0;
    // 触发失败逻辑
    this.hud.showToast('时间到！⏰');
    // 显示续命或重新开始选项
    this.showTimeUpDialog();
  }
  // 每秒钟播放一次心跳（最后 10 秒加速）
  if (this.levelTimer < 10) {
    const heartbeatIntensity = 1 - this.levelTimer / 10;
    // 每 0.5 秒一次心跳
    this.heartbeatAccumulator += delta;
    if (this.heartbeatAccumulator > 0.5) {
      this.heartbeatAccumulator = 0;
      this.audio.heartbeat(heartbeatIntensity);
    }
  }
}
```

需要添加 `heartbeatAccumulator = 0` 字段。

- [ ] **Step 4: 传递计时器到 Hud.update()**

在 `Game.update()` 的 `this.hud.update(...)` 调用中添加：
```typescript
this.levelTimeLimit > 0 ? this.levelTimer : undefined,
this.levelTimeLimit > 0 ? this.levelTimeLimit : undefined,
```

- [ ] **Step 5: 验证构建**

```bash
npx vite build
```

- [ ] **Step 6: 提交**

```bash
git add src/game/Game.ts src/systems/Hud.ts index.html
git commit -m "feat: Add level countdown timer from L3+ with heartbeat SFX and timer bar UI"
```

---

### Task 6: 手机 UI 适配

**Files:**
- Modify: `src/styles.css`
- Modify: `src/systems/Hud.ts`
- Modify: `index.html`

**Interfaces:**
- Consumes: 现有 HUD 结构
- Produces: 响应式 CSS + HUD 自适应显示

- [ ] **Step 1: 在 styles.css 末尾添加手机媒体查询**

```css
/* ===== 手机响应式布局 ===== */
@media (max-width: 768px) {
  #hud {
    padding: 6px 10px;
  }
  .hud-top {
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 4px;
    font-size: 0.65rem;
  }
  .hud-left, .hud-center, .hud-right {
    flex: 1;
  }
  .hud-center {
    gap: 4px;
  }
  .hud-item {
    padding: 2px 6px;
  }
  .hud-label {
    font-size: 0.55rem;
  }
  .hud-value {
    font-size: 0.75rem;
  }
  #status-text {
    font-size: 0.7rem;
    bottom: 100px;
    padding: 4px 12px;
  }
  /* 提示文字底部固定 */
  #feed-hint, #vendor-hint, #money-tree-hint, #jump-hint {
    bottom: 80px;
    font-size: 0.7rem;
  }
  /* 摇杆放大 */
  #touch-stick {
    width: 110px;
    height: 110px;
  }
  #touch-knob {
    width: 44px;
    height: 44px;
  }
  /* 按钮放大 */
  #feed-button, #dash-button {
    width: 56px;
    height: 56px;
    font-size: 1.4rem;
  }
  #touch-controls {
    right: max(12px, env(safe-area-inset-right));
    bottom: max(12px, env(safe-area-inset-bottom));
  }
  .touch-right {
    gap: 10px;
  }
  /* 分享/广告按钮 */
  .share-btn, .ad-btn {
    font-size: 0.65rem;
    padding: 6px 10px;
    top: 60px;
  }
  /* 图鉴全屏 */
  .journal-panel {
    width: 95vw;
    max-height: 85vh;
    padding: 12px;
  }
  /* 标题页 */
  .title-card {
    width: 90vw;
    padding: 24px 16px;
  }
}
```

- [ ] **Step 2: 添加 .share-btn 显示初始状态修复**

在 CSS 中确保 share button 在 `display: none` 状态下不显示，但 `setShareAvailable(true)` 能正常覆盖：
```css
.share-btn[style*="display: none"] {
  display: none !important;
}
```
(或者保持现状，因为 `style="display:none"` 是内联样式，`setShareAvailable` 用 `style.display = 'block'` 覆盖即可——注意顺序)

- [ ] **Step 3: 验证构建**

```bash
npx vite build
```

- [ ] **Step 4: 提交**

```bash
git add src/styles.css
git commit -m "style: Add responsive mobile layout via CSS media queries"
```

---

### Task 7: 广告系统

**Files:**
- Create: `src/systems/AdSystem.ts`
- Modify: `src/game/Game.ts`
- Modify: `index.html`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `AudioSystem.adComplete()`, `Game.money`, `Game.crackerCount`
- Produces:
  - `AdSystem.playRewardedAd(): Promise<boolean>` — 模拟广告播放
  - `AdSystem.canPlay(): boolean` — 是否可播放（限制频率）

- [ ] **Step 1: 创建 AdSystem.ts**

```typescript
export class AdSystem {
  private adShowing = false;

  // 预留真实 SDK 接口：替换此方法即可接入真实广告
  async playRewardedAd(): Promise<boolean> {
    if (this.adShowing) return false;
    this.adShowing = true;

    return new Promise((resolve) => {
      // 创建广告覆盖层
      const overlay = document.createElement('div');
      overlay.className = 'ad-overlay';
      overlay.innerHTML = `
        <div class="ad-container">
          <div class="ad-label">🎬 広告再生中…</div>
          <div class="ad-countdown">5</div>
          <div class="ad-sub">看完可获得奖励</div>
        </div>
      `;
      document.body.appendChild(overlay);

      // 倒计时
      let count = 5;
      const countdownEl = overlay.querySelector('.ad-countdown')!;
      const timer = setInterval(() => {
        count--;
        countdownEl.textContent = String(count);
        if (count <= 0) {
          clearInterval(timer);
          document.body.removeChild(overlay);
          this.adShowing = false;
          resolve(true);
        }
      }, 1000);
    });
  }

  canPlay(): boolean {
    return !this.adShowing;
  }

  dispose(): void {
    this.adShowing = false;
  }
}
```

- [ ] **Step 2: 添加广告覆盖层样式**

在 styles.css 中添加：
```css
/* ===== Ad Overlay ===== */
.ad-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.ad-container {
  text-align: center;
  color: #fff;
}
.ad-label {
  font-size: 1.2rem;
  margin-bottom: 16px;
  opacity: 0.8;
}
.ad-countdown {
  font-size: 4rem;
  font-weight: 700;
  color: #ffd54f;
}
.ad-sub {
  font-size: 0.85rem;
  margin-top: 12px;
  opacity: 0.6;
}
```

- [ ] **Step 3: 在 index.html 中添加广告按钮**

```html
<!-- Ad button -->
<button id="ad-button" type="button" class="ad-btn" style="display:none">📺 广告 (100円)</button>
```

- [ ] **Step 4: 在 Game.ts 中集成广告系统**

导入并添加字段：
```typescript
import { AdSystem } from '../systems/AdSystem';

private readonly adSystem = new AdSystem();
private adMoneyUsed = 0;  // 本关看广告得钱次数
private adCrackerUsed = 0; // 本关看广告补仙贝次数
```

添加方法：
```typescript
private setupAdButton(): void {
  const btn = document.getElementById('ad-button');
  if (btn) {
    btn.addEventListener('click', () => this.doAdReward());
  }
}

private async doAdReward(): Promise<void> {
  if (this.adMoneyUsed >= 2) {
    this.hud.showToast('本关已看满广告 🙏');
    return;
  }
  const success = await this.adSystem.playRewardedAd();
  if (success) {
    this.money += 100;
    this.adMoneyUsed++;
    this.audio.adComplete();
    this.hud.showToast('看广告获得 100 円 🎉');
  }
}

private async doAdCracker(): Promise<void> {
  if (this.adCrackerUsed >= 1 || this.crackerCount > 0) return;
  const success = await this.adSystem.playRewardedAd();
  if (success) {
    this.crackerCount += 2;
    this.adCrackerUsed++;
    this.audio.adComplete();
    this.hud.showToast('看广告获得 2 块仙贝 🍘');
  }
}
```

在构造函数中调用 `this.setupAdButton()`。

在 `update()` 中，当 `crackerCount === 0` 时，显示补仙贝广告按钮：
```typescript
// 在 Hud.update() 中传递 adAvailable 状态
```

在 Hud 中添加广告按钮显示逻辑：
```typescript
const adBtn = this.getElement('#ad-button');
if (adBtn) {
  // money < 100 且 adMoneyUsed < 2 时显示广告按钮
  if (complete) {
    adBtn.classList.add('hidden');
  } else {
    adBtn.style.display = 'block';
  }
}
```

- [ ] **Step 5: 广告按钮样式**

```css
.ad-btn {
  position: absolute;
  top: 80px;
  right: 140px;
  padding: 8px 14px;
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.4);
  border-radius: 8px;
  color: #66bb6a;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  z-index: 15;
  backdrop-filter: blur(4px);
  transition: background 0.2s, transform 0.15s;
}
.ad-btn:hover {
  background: rgba(76, 175, 80, 0.35);
  transform: scale(1.05);
}
```

- [ ] **Step 6: 验证构建**

```bash
npx vite build
```

- [ ] **Step 7: 提交**

```bash
git add src/systems/AdSystem.ts src/game/Game.ts index.html src/styles.css
git commit -m "feat: Add rewarded ad system with timer overlay, money and cracker rewards"
```

---

### Task 8: 障碍物密度递增

**Files:**
- Modify: `src/game/Game.ts`

**Interfaces:**
- Consumes: `generateObstacles()` 函数
- Produces: L5+ 更高的障碍物数量

- [ ] **Step 1: 修改障碍物生成逻辑**

找到 `const OBSTACLES = generateObstacles(40);` 将其改为函数，按关卡生成：

```typescript
function getObstacleCount(level: number): number {
  if (level < 5) return 40;
  return Math.min(100, 40 + (level - 5) * 15);
}
```

并修改 Game 中创建障碍物的方式，传入当前关卡：
```typescript
private createObstacles(): void {
    const count = getObstacleCount(this.currentLevel);
    const positions = generateObstacles(count);
    for (const def of positions) {
      const obs = new Obstacle(def);
      this.obstacles.push(obs);
      this.scene.add(obs.group);
    }
  }
```

注意：`generateObstacles` 需要从模块级改为实例可调用，或者保留为纯函数但接受参数。

最简单方式：把 `generateObstacles(40)` 改为函数调用：

将 `const OBSTACLES = generateObstacles(40);` 和 `const CHEST_SPAWNS = generateChestSpawns(25);` 移到 `createObstacles` 和 `createChests` 方法内。

- [ ] **Step 2: 验证构建**

```bash
npx vite build
```

- [ ] **Step 3: 提交**

```bash
git add src/game/Game.ts
git commit -m "feat: Scale obstacle density from L5+ — up to 100 obstacles"
```

---

## 执行顺序

1. **Task 1** — 修复分享（最小改动，先修 bug）
2. **Task 2** — 音效 + BGM（独立模块）
3. **Task 3** — 鹿性格（核心玩法扩展）
4. **Task 4** — 水域惩罚（难度 L2）
5. **Task 5** — 倒计时（难度 L3）
6. **Task 6** — 手机 UI（响应式）
7. **Task 7** — 广告系统（变现）
8. **Task 8** — 障碍物密度（难度 L5+）
