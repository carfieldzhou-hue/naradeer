import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Player, type ArenaBounds } from '../entities/Player';
import { Deer, DeerPersonality, DeerRarity } from '../entities/Deer';
import { Obstacle } from '../entities/Obstacle';
import { Vendor } from '../entities/Vendor';
import { TreasureChest } from '../entities/TreasureChest';
import { AudioSystem, type ReverbZone } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Journal } from '../systems/Journal';
import { Hud } from '../systems/Hud';
import { ParticleSystem } from '../systems/ParticleSystem';
import { Park, type MoneyTreeInfo } from '../environment/Park';
import { SimonSays } from '../minigames/SimonSays';

const BASE_BOUNDS: ArenaBounds = {
  halfWidth: 120,
  halfDepth: 90,
};

function getBoundsForLevel(level: number): ArenaBounds {
  // Level 1 is a SMALL tutorial-scale arena so first-time players can
  // finish a full feeding loop in a couple of minutes — the goal is for
  // the first run to feel easy and satisfying, then difficulty ramps up.
  // Each subsequent level doubles the arena. The map stops growing at
  // level 7 so it never becomes unwieldy to traverse (capped scale).
  //
  //   L1 → 0.25 × BASE  (half of the previous L1 size, per dad 2026-07-10:
  //                       "再减少 50%，方便通关，我想客户第一关尽可能简单")
  //   L2 → 0.5  × BASE
  //   L3 → 1.0  × BASE
  //   L4 → 2.0  × BASE
  //   …
  //   L7+ → cap
  //
  // Note: only L1 is shrunk further than the prior curve. Other levels
  // remain on the original L2=0.5× / L3=1.0× / L4=2.0× ramp.
  const effective = Math.max(1, Math.min(level, 7));
  const baseScale = 0.5 * Math.pow(2, effective - 1);
  const scale = level === 1 ? baseScale * 0.5 : baseScale;
  return {
    halfWidth: Math.round(BASE_BOUNDS.halfWidth * scale),
    halfDepth: Math.round(BASE_BOUNDS.halfDepth * scale),
  };
}

// How much smaller/larger the current arena is vs the design-space bounds.
// All fixed-coordinate content (deer, chests, obstacles) is authored in the
// BASE_BOUNDS space, so we multiply by this factor to keep it inside the arena.
function contentScaleFor(b: ArenaBounds): number {
  return b.halfWidth / BASE_BOUNDS.halfWidth;
}

const DEER_SPAWNS = [
  { x: -5, z: -3 }, { x: 12, z: -8 }, { x: -15, z: 10 }, { x: 20, z: 15 },
  { x: -30, z: -25 }, { x: 10, z: -35 }, { x: -45, z: -10 },
  { x: 40, z: 5 }, { x: 55, z: -20 }, { x: 65, z: 30 },
  { x: -20, z: 40 }, { x: 30, z: 50 }, { x: -50, z: 55 },
  { x: -70, z: -5 }, { x: -80, z: 30 }, { x: -90, z: -60 },
];

function generateObstacles(count: number): Array<{ x: number; z: number; rotation: number; width?: number; type?: 'barrier' | 'fence' | 'wall' }> {
  const obstacles: Array<{ x: number; z: number; rotation: number; width?: number; type?: 'barrier' | 'fence' | 'wall' }> = [];
  const minDist = 8;
  const types: Array<'barrier' | 'fence' | 'wall'> = ['barrier', 'fence', 'wall', 'barrier', 'barrier'];
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 50) {
      const x = (Math.random() - 0.5) * (BASE_BOUNDS.halfWidth * 1.6);
      const z = (Math.random() - 0.5) * (BASE_BOUNDS.halfDepth * 1.6);
      let tooClose = false;
      for (const obs of obstacles) {
        const dx = obs.x - x;
        const dz = obs.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDist) { tooClose = true; break; }
      }
      if (!tooClose) {
        const t = types[Math.floor(Math.random() * types.length)];
        obstacles.push({ x, z, rotation: Math.random() * Math.PI, width: 0.6 + Math.random() * 0.8, type: t });
        break;
      }
      attempts++;
    }
  }
  return obstacles;
}

function generateAlcoveObstacles(): Array<{ x: number; z: number; rotation: number; width?: number; type?: 'barrier' | 'fence' | 'wall' }> {
  const alcoves: Array<{ x: number; z: number; rotation: number; width?: number; type?: 'barrier' | 'fence' | 'wall' }> = [];
  // Hidden alcove positions (U-shapes made of walls)
  const alcoveCenters = [
    { x: -70, z: -50 }, { x: 80, z: -40 }, { x: 60, z: 70 }, { x: -90, z: 60 },
  ];
  for (const c of alcoveCenters) {
    const w = 4;
    // Back wall
    alcoves.push({ x: c.x, z: c.z - w / 2, rotation: 0, width: w, type: 'wall' });
    // Left wall
    alcoves.push({ x: c.x - w / 2, z: c.z, rotation: Math.PI / 2, width: w, type: 'wall' });
    // Right wall
    alcoves.push({ x: c.x + w / 2, z: c.z, rotation: Math.PI / 2, width: w, type: 'wall' });
  }
  return alcoves;
}

const OBSTACLES = [...generateObstacles(40), ...generateAlcoveObstacles()];

// Vendor stalls are now spawned procedurally per level (see createVendorsForLevel),
// so no fixed spawn list is needed.

function generateChestSpawns(count: number): Array<{ x: number; z: number }> {
  const chests: Array<{ x: number; z: number }> = [];
  const minDist = 12;
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 50) {
      const x = (Math.random() - 0.5) * (BASE_BOUNDS.halfWidth * 1.4);
      const z = (Math.random() - 0.5) * (BASE_BOUNDS.halfDepth * 1.4);
      let tooClose = false;
      for (const c of chests) {
        const dx = c.x - x;
        const dz = c.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDist) { tooClose = true; break; }
      }
      if (!tooClose) { chests.push({ x, z }); break; }
      attempts++;
    }
  }
  return chests;
}

const CHEST_SPAWNS = generateChestSpawns(25);

export interface LevelConfig {
  level: number;
  deerToFeed: number;
  moneyPool: number;
  initialCrackers: number;
  crackerPrice: number;
}

function getLevelConfig(level: number): LevelConfig {
  const deerToFeed = Math.min(16, 5 + (level - 1) * 2);
  // Gentle exponential decay so the money edge doesn't crater: L1≈1000, L2≈600,
  // L3≈360 … floored at 50 so chests never pay out nothing.
  const moneyPool = Math.max(50, Math.floor(1000 * Math.pow(0.6, level - 1)));
  return { level, deerToFeed, moneyPool, initialCrackers: 3, crackerPrice: 100 };
}

function distributeMoney(pool: number, count: number): number[] {
  const values: number[] = [];
  let remaining = pool;
  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      values.push(remaining);
    } else {
      const avg = remaining / (count - i);
      const min = Math.max(1, Math.floor(avg * 0.5));
      const max = Math.max(min + 1, Math.floor(avg * 1.5));
      const val = min + Math.floor(Math.random() * (max - min));
      values.push(val);
      remaining -= val;
    }
  }
  return values;
}

export interface ShopItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  unlockLevel: number;
  once?: boolean; // one-time purchase that lasts the whole level (e.g. bike)
}

/** Consumable items = the economy's spending outlets. Each is unlocked at a
 *  specific level so new tools appear progressively, not all at once. */
const SHOP_ITEMS: ShopItemDef[] = [
  { id: 'whistle',   name: '鹿笛',       icon: '🎵', desc: '召唤附近 3 只未喂鹿靠近你',     cost: 150, unlockLevel: 2 },
  { id: 'radar',     name: '寻鹿雷达',   icon: '📡', desc: '30 秒内箭头指向最近未喂鹿',     cost: 120, unlockLevel: 2 },
  { id: 'speed',     name: '速度符',     icon: '💨', desc: '20 秒内移速 ×1.8',             cost: 200, unlockLevel: 3 },
  { id: 'waterward', name: '避水符',     icon: '☂️', desc: '60 秒内免疫水池惩罚',          cost: 180, unlockLevel: 3 },
  { id: 'stealth',   name: '隐身斗篷',   icon: '👘', desc: '15 秒内稀有 / 传说鹿不逃跑',   cost: 300, unlockLevel: 5 },
  { id: 'bike',      name: '环保自行车', icon: '🚲', desc: '本关移速 ×2.5（整关生效）',    cost: 500, unlockLevel: 7, once: true },
];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  private readonly input: InputController;
  private readonly player = new Player();
  private readonly deerList: Deer[] = [];
  private readonly audio = new AudioSystem();
  private readonly hud = new Hud();
  private readonly cameraRig = new CameraRig(this.camera);
  private readonly _audioCamPos = new THREE.Vector3();
  private readonly _audioCamFwd = new THREE.Vector3();
  private readonly particles: ParticleSystem;
  private readonly park: Park;
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private readonly tuning: DebugTuning = {
    speed: 5,
    dashMultiplier: 1.6,
    acceleration: 10,
    cameraLag: 0.18,
    exposure: 1.0,
    maxDpr: 2,
  };

  private readonly debugTools: DebugTools;
  private frame = 0;
  private elapsed = 0;
  private readonly journal: Journal;
  private readonly obstacles: Obstacle[] = [];
  private readonly vendors: Vendor[] = [];
  private readonly chests: TreasureChest[] = [];
  private crackerCount = 3;
  private money = 0;
  private obstacleNearby = false;
  private feedCooldown = 0;
  private nearestDeer: Deer | null = null;
  private nearestVendor: Vendor | null = null;
  private nearestMoneyTree: MoneyTreeInfo | null = null;
  private readonly moneyTrees: (MoneyTreeInfo & { collected: boolean })[] = [];
  private moneyTreeShakeTimer = 0;
  private moneyTreeShakeGroup: THREE.Group | null = null;
  private shareCooldown = 0;           // seconds; anti-spam gate between shares
  private totalShares = 0;             // lifetime shares (meta progression / titles)
  private currentTitle = '';            // last unlocked title (change detection)
  private sharedBonusForNextLevel = false;
  private waterCooldown = 0;
  private wasInWater = false;
  private readonly simonSays = new SimonSays();
  private templeRepaired = false;

  // Consumable item effect timers (seconds remaining). bikeActive is a
  // whole-level flag (one-time purchase). These are the economy's outlets.
  private radarTimer = 0;
  private speedBoostTimer = 0;
  private waterWardTimer = 0;
  private stealthTimer = 0;
  private bikeActive = false;

  private currentLevel = 1;
  private currentBounds: ArenaBounds = BASE_BOUNDS;
  private levelConfig!: LevelConfig;
  private deerFed = 0;
  private levelComplete = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.levelConfig = getLevelConfig(this.currentLevel);
    this.crackerCount = this.levelConfig.initialCrackers;

    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = true;

    const stick = this.getElement('#touch-stick');
    const knob = this.getElement('#touch-knob');
    this.input = new InputController(stick, knob);
    // Feed is now a centre-tap on the joystick (one-thumb operation).
    this.input.setFeedCallback(() => this.tryFeed());

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.particles = new ParticleSystem(this.scene);
    this.currentBounds = getBoundsForLevel(this.currentLevel);
    this.park = new Park(this.scene, this.currentBounds);
    this.scene.add(this.park.group);

    this.createScene();
    this.createDeer();
    this.createObstacles();
    this.createVendors();
    this.createChests(this.levelConfig.moneyPool);

    this.journal = new Journal(this.deerList.map((d) => d.getDeerInfo()));

    // Restore lifetime share count + title (meta progression, persisted locally).
    this.totalShares = this.loadTotalShares();
    this.currentTitle = this.computeTitle(this.totalShares).name;
    this.journal.setTitle(this.currentTitle);

    this.hud.setLevel(this.currentLevel, this.levelConfig.deerToFeed);
    this.cameraRig.snapTo(this.player.group.position, this.input.getCameraYaw(), this.input.getCameraPitch());
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);

    // Wire player callbacks for audio
    this.player.onDash = () => this.audio.dash();

    // Show touch controls on touch-capable devices (mobile/tablet)
    const touchControls = document.getElementById('touch-controls');
    if (touchControls && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      touchControls.style.display = 'flex';
    }

    this.publishDiagnostics();
    this.setupFeedInput();
    this.setupJournalInput();
    this.setupJournalShare();
    this.setupLevelButtons();
    this.setupShareButton();
    this.setupShop();
    // Reveal the shop button now that the game (and its handlers) are ready.
    const shopBtn = document.getElementById('shop-button');
    if (shopBtn) shopBtn.style.display = 'block';
  }

  start(): void {
    this.audio.startBGM(this.currentLevel);
    this.loop.start();
  }

  /** Open/close the deer codex journal. Exposed so main.ts (and other
   *  entry points) can toggle it without reaching into private fields. */
  toggleJournal(): void {
    this.journal.toggle();
  }

  restart(): void {
    this.currentLevel = 1;
    this.elapsed = 0;
    this.startLevel(this.currentLevel);
  }

  nextLevel(): void {
    this.startLevel(this.currentLevel + 1);
  }

  private setupLevelButtons(): void {
    const nextBtn = document.getElementById('next-level-button');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.audio.uiClick();
        this.nextLevel();
      });
    }
    const restartBtn = document.getElementById('restart-button');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.audio.uiClick();
        this.restart();
      });
    }
    const shareBtn = document.getElementById('completion-share-button');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        this.audio.uiClick();
        this.doCompletionShare();
      });
    }
  }

  private startLevel(level: number): void {
    this.currentLevel = level;
    this.currentBounds = getBoundsForLevel(level);
    this.levelConfig = getLevelConfig(level);
    this.deerFed = 0;
    this.crackerCount = this.levelConfig.initialCrackers; // crackers reset each level (don't carry)
    // Money carries across levels to reduce difficulty; only a fresh restart
    // back to level 1 zeroes it. The completion-share bonus is folded into
    // the carry (added when entering the next level).
    if (level === 1) {
      this.money = 0;
    } else {
      this.money += this.sharedBonusForNextLevel ? 100 : 0;
    }
    this.sharedBonusForNextLevel = false;
    this.levelComplete = false;
    this.feedCooldown = 0;
    this.obstacleNearby = false;
    this.nearestDeer = null;
    this.nearestVendor = null;
    this.nearestMoneyTree = null;
    this.shareCooldown = 0;
    this.moneyTreeShakeTimer = 0;
    this.moneyTreeShakeGroup = null;
    this.waterCooldown = 0;
    this.wasInWater = false;
    this.templeRepaired = false;
    // Reset consumable item effects each level (bike is per-level too).
    this.radarTimer = 0;
    this.speedBoostTimer = 0;
    this.waterWardTimer = 0;
    this.stealthTimer = 0;
    this.bikeActive = false;
    this.hud.setRadar(null);
    this.elapsed = 0;

    this.audio.stopBGM();
    this.audio.startBGM(this.currentLevel);

    this.player.group.position.set(0, 0, 0);
    this.player.velocity.set(0, 0, 0);

    // Regenerate park scenery with new bounds (and pass the level so
    // water hazards/pond only appear from level 2 on).
    this.park.regenerate(this.currentBounds, level);

    // Update shadow camera for new bounds
    const sun = this.scene.children.find(c => c instanceof THREE.DirectionalLight && c.castShadow) as THREE.DirectionalLight | undefined;
    if (sun) {
      const margin = 1.5;
      sun.shadow.camera.left = -this.currentBounds.halfWidth * margin;
      sun.shadow.camera.right = this.currentBounds.halfWidth * margin;
      sun.shadow.camera.top = this.currentBounds.halfDepth * margin;
      sun.shadow.camera.bottom = -this.currentBounds.halfDepth * margin;
      sun.shadow.camera.updateProjectionMatrix();
    }

    // Update fog for new bounds
    const far = Math.max(this.currentBounds.halfWidth, this.currentBounds.halfDepth) * 1.5;
    this.scene.fog = new THREE.Fog('#c8e6c9', far * 0.3, far);

    for (const deer of this.deerList) deer.reset(level);
    this.journal.updateEntries(this.deerList.map((d) => d.getDeerInfo()));
    this.createChests(this.levelConfig.moneyPool);
    this.createVendorsForLevel(level);
    this.setupMoneyTrees();
    this.hud.setShareAvailable(true);

    this.hud.setLevel(level, this.levelConfig.deerToFeed);
    this.hud.hideCompletion();
    // Re-show the shop button for the new level.
    const sb = document.getElementById('shop-button');
    if (sb) sb.style.display = 'block';
    this.cameraRig.snapTo(this.player.group.position, this.input.getCameraYaw(), this.input.getCameraPitch());

    // Pre-level hint: warn about water hazards (they appear from level 2 on).
    if (level >= 2) {
      this.hud.showToast('⚠️ 本关有水池！掉进去会丢失仙贝，绕开走～', 4500);
    }
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    this.particles.dispose();
    this.park.dispose();
    this.simonSays.dispose();
    for (const deer of this.deerList) deer.dispose();
    this.player.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    if (!this.levelComplete) this.elapsed += delta;

    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);

    if (this.feedCooldown > 0) this.feedCooldown -= delta;
    if (this.shareCooldown > 0) this.shareCooldown -= delta;

    // Consumable item timers
    if (this.radarTimer > 0) this.radarTimer -= delta;
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= delta;
    if (this.waterWardTimer > 0) this.waterWardTimer -= delta;
    if (this.stealthTimer > 0) this.stealthTimer -= delta;

    // Speed boost: eco bike (whole level) takes priority over the charm,
    // otherwise the 20s charm applies; both multiply the base walk speed.
    this.player.boostMultiplier = this.bikeActive ? 2.5 : (this.speedBoostTimer > 0 ? 1.8 : 1);

    this.player.update(delta, elapsed, this.input, this.tuning, this.currentBounds, this.input.getCameraYaw());

    const stealthed = this.stealthTimer > 0;
    for (const deer of this.deerList) {
      deer.update(delta, this.player.group.position, stealthed);
    }

    const playerPos = this.player.group.position;
    for (const deer of this.deerList) {
      if (deer.personality === DeerPersonality.Aggressive && deer.aggressiveState === 'charging') {
        const dist = playerPos.distanceTo(deer.group.position);
        if (dist < 0.5 && this.crackerCount > 0) {
          this.crackerCount--;
          this.audio.error();
          this.hud.showToast('被暴躁鹿撞到！-1 仙贝 😠');
          const pushDir = playerPos.clone().sub(deer.group.position).normalize();
          this.player.group.position.add(pushDir.multiplyScalar(1.5));
          deer.aggressiveState = 'fleeing';
        }
      }
    }

    // Water hazard detection
    if (this.waterCooldown > 0) this.waterCooldown -= delta;
    const inWater = this.park.isInWater(this.player.group.position);
    if (inWater && !this.wasInWater && this.waterCooldown <= 0 && !this.levelComplete && this.waterWardTimer <= 0) {
      this.crackerCount--;
      this.waterCooldown = 3;
      this.audio.splash(this.player.group.position);
      this.hud.showToast('掉水里了！-1 仙贝 💧');
      // Push player back
      const pushDir = new THREE.Vector3().copy(this.player.group.position).negate();
      pushDir.y = 0;
      if (pushDir.lengthSq() > 0.01) pushDir.normalize().multiplyScalar(2);
      else pushDir.set(1, 0, 0);
      this.player.group.position.add(pushDir);
    }
    this.wasInWater = inWater;

    this.obstacleNearby = false;
    const px = this.player.group.position.x;
    const pz = this.player.group.position.z;
    const playerRadius = 0.25;
    for (const obs of this.obstacles) {
      const nearMargin = 1.5;
      if (px > obs.minX - nearMargin && px < obs.maxX + nearMargin &&
          pz > obs.minZ - nearMargin && pz < obs.maxZ + nearMargin) {
        this.obstacleNearby = true;
      }
      if (this.player.isOnGround()) {
        const closestX = Math.max(obs.minX, Math.min(px, obs.maxX));
        const closestZ = Math.max(obs.minZ, Math.min(pz, obs.maxZ));
        const dx = px - closestX;
        const dz = pz - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < playerRadius * playerRadius) {
          const dist = Math.max(Math.sqrt(distSq), 0.001);
          const overlap = playerRadius - dist;
          const pushX = (dx / dist) * overlap;
          const pushZ = (dz / dist) * overlap;
          this.player.group.position.x += pushX;
          this.player.group.position.z += pushZ;
        }
      }
    }

    this.nearestDeer = null;
    let nearestDist = 2.5;
    for (const deer of this.deerList) {
      if (!deer.canBeFed()) continue;
      const dist = deer.group.position.distanceTo(this.player.group.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        this.nearestDeer = deer;
      }
    }

    this.nearestVendor = null;
    for (const vendor of this.vendors) {
      if (vendor.isPlayerNear(this.player.group.position)) {
        this.nearestVendor = vendor;
        break;
      }
    }

    this.nearestMoneyTree = null;
    for (const mt of this.moneyTrees) {
      if (!mt.collected && mt.group.position.distanceTo(this.player.group.position) < 2.0) {
        this.nearestMoneyTree = mt;
        break;
      }
    }

    if (this.moneyTreeShakeTimer > 0 && this.moneyTreeShakeGroup) {
      this.moneyTreeShakeTimer -= delta;
      const phase = this.moneyTreeShakeTimer * 20;
      this.moneyTreeShakeGroup.rotation.z = Math.sin(phase) * 0.15;
      if (this.moneyTreeShakeTimer <= 0) {
        this.moneyTreeShakeGroup.rotation.z = 0;
        this.moneyTreeShakeGroup = null;
      }
    }

    for (const chest of this.chests) {
      chest.update(delta);
      if (chest.isPlayerNear(this.player.group.position)) {
        const money = chest.collect();
        if (money > 0) {
          this.money += money;
          this.audio.chestOpen(chest.group.position);
          this.particles.emitPickup(chest.group.position.clone());
        }
      }
    }

    const coinMoney = this.park.collectCoin(this.player.group.position, 0.5);
    if (coinMoney > 0) {
      this.money += coinMoney;
      this.audio.coin(this.player.group.position);
      this.hud.showToast('拾到 1 円！💰');
    }

    // Deer radar: point an arrow at the nearest unfed deer (camera-relative).
    if (this.radarTimer > 0) {
      const target = this.findNearestUnfedDeer();
      if (target) {
        const yaw = this.input.getCameraYaw();
        const wx = target.group.position.x - this.player.group.position.x;
        const wz = target.group.position.z - this.player.group.position.z;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        const forwardComp = -wx * sin - wz * cos;
        const rightComp = wx * cos - wz * sin;
        this.hud.setRadar(Math.atan2(rightComp, forwardComp) * 180 / Math.PI);
      } else {
        this.hud.setRadar(null);
      }
    } else {
      this.hud.setRadar(null);
    }

    this.cameraRig.update(delta, this.player.group.position, this.tuning.cameraLag, this.input.getCameraYaw(), this.input.getCameraPitch());
    this.particles.update(delta);
    this.park.update(delta);

    // ---- 自适应音频：听者 / 张力 / 混响分区 / 相位 ----
    this.camera.getWorldPosition(this._audioCamPos);
    this.camera.getWorldDirection(this._audioCamFwd);
    this.audio.setListener(this._audioCamPos, this._audioCamFwd);

    let tension = 0;
    for (const deer of this.deerList) {
      if (deer.aggressiveState === 'charging') {
        const d = deer.group.position.distanceTo(playerPos);
        tension = Math.max(tension, 0.6 * Math.max(0, 1 - d / 12));
      }
    }
    if (this.money < 100) tension = Math.max(tension, 0.12);
    this.audio.setTension(tension);

    let zone: ReverbZone = 'outdoor';
    if (this.park.temples.length > 0 &&
        this.park.temples[0].group.position.distanceTo(playerPos) < 14) {
      zone = 'temple';
    }
    this.audio.setReverbZone(zone);

    let social = false;
    for (const deer of this.deerList) {
      if (deer.group.position.distanceTo(playerPos) >= 6) continue;
      const s = deer.state.current;
      if (s === 'bow' || s === 'eating' || s === 'happy' || s === 'approach') {
        social = true;
        break;
      }
    }
    this.audio.setPhase(social ? 'social' : 'explore');

    this.hud.update(
      this.deerFed,
      this.levelConfig.deerToFeed,
      this.elapsed,
      this.levelComplete,
      this.nearestDeer !== null && this.crackerCount > 0,
      this.journal.getCollectedCount(),
      this.obstacleNearby && this.player.isOnGround(),
      this.crackerCount,
      this.money,
      this.nearestVendor !== null,
      this.currentLevel,
      this.nearestMoneyTree !== null,
      this.shareCooldown <= 0,
    );

    if (this.deerFed >= this.levelConfig.deerToFeed && !this.levelComplete) {
      this.levelComplete = true;
      this.audio.victory();
      this.audio.levelUp();
      this.particles.emitConfetti(this.player.group.position.clone().add(new THREE.Vector3(0, 2, 0)));
      // Hide the shop button + close any open shop while the completion card is up.
      const sb = document.getElementById('shop-button');
      if (sb) sb.style.display = 'none';
      this.closeShop();
    }

    this.publishDiagnostics();
  }

  private tryFeed(): void {
    if (this.feedCooldown > 0 || this.levelComplete) return;

    // Temple repair mini-game
    if (!this.templeRepaired && this.park.temples.length > 0 && !this.simonSays.isActive) {
      const templePos = this.park.temples[0].group.position;
      if (templePos.distanceTo(this.player.group.position) < 2.0) {
        this.simonSays.start(() => {
          this.templeRepaired = true;
          this.money += 50;
          this.audio.feed();
          this.hud.showToast('神社修复完成！获得 50 円 🎉');
        });
        this.feedCooldown = 0.5;
        return;
      }
    }

    // Bench puzzle activation
    if (this.park.isBenchNear(this.player.group.position)) {
      if (this.park.activateBench()) {
        this.audio.feed();
        this.hud.showToast('长椅被推开了！露出了秘密通道 🪤');
        this.feedCooldown = 0.5;
      }
      return;
    }

    // Money tree collection
    if (this.nearestMoneyTree && !this.nearestMoneyTree.collected) {
      this.nearestMoneyTree.collected = true;
      this.nearestMoneyTree.sprite.visible = false;
      this.money += this.nearestMoneyTree.moneyValue;
      this.moneyTreeShakeTimer = 0.5;
      this.moneyTreeShakeGroup = this.nearestMoneyTree.group;
      this.audio.feed();
      this.particles.emitPickup(this.nearestMoneyTree.position.clone());
      this.hud.showToast(`摇到 ${this.nearestMoneyTree.moneyValue} 円！💰`);
      this.feedCooldown = 0.3;
      return;
    }

    if (this.nearestVendor) {
      if (this.money >= this.levelConfig.crackerPrice) {
        this.money -= this.levelConfig.crackerPrice;
        this.crackerCount++;
        this.audio.feed();
        this.hud.showToast('购买成功！仙贝 +1');
        this.feedCooldown = 0.3;
      } else {
        this.audio.error();
        this.hud.showToast(`金钱不足！需要${this.levelConfig.crackerPrice}円`);
        this.feedCooldown = 0.5;
      }
      return;
    }

    if (this.nearestDeer) {
      // Already fed this level — give clear feedback instead of silently doing nothing.
      if (this.nearestDeer.fed) {
        this.audio.error();
        this.hud.showToast('小鹿已吃饱啦 🍃');
        this.feedCooldown = 0.5;
        return;
      }
      if (this.nearestDeer.canBeFed()) {
        if (this.crackerCount > 0) {
          this.doFeed(this.nearestDeer);
        } else {
          this.audio.error();
          this.hud.showToast('没有仙贝了！先去小摊购买');
          this.feedCooldown = 0.5;
        }
        return;
      }
    }
  }

  doShare(): void {
    if (this.levelComplete) {
      this.hud.showToast('关卡已完成啦，用通关分享按钮吧 🦌');
      return;
    }
    if (this.shareCooldown > 0) {
      this.hud.showToast(`分享冷却中…（${Math.ceil(this.shareCooldown)}s）`, 1200);
      return;
    }
    const url = window.location.href;
    const text = this.buildShareText(false);

    // 1) Web Share API — native share sheet in mobile Safari/Chrome AND desktop
    //    Chrome/Edge (over localhost/HTTPS). This IS the primary "分享按钮":
    //    tapping share pops the OS share sheet directly.
    if (this.canUseWebShare()) {
      this.tryWebShare(text, url, () => this.onShareSuccess(false));
      return;
    }

    // 2) No native Web Share (WeChat/QQ in-app, desktop Firefox/Safari) —
    //    count the click as the share action and immediately reward +100 円
    //    (anti-spam via shareCooldown) and pop the manual share guide. One
    //    tap → done. No intermediate panel.
    this.onShareSuccess(false);
    this.showShareGuide(text);
  }

  /**
   * Build the full share copy — a punchy, challenge-flavoured blurb that
   * already embeds the game link, so every channel (native sheet, clipboard
   * copy, WeChat pre-fill) carries the whole pitch, not just a bare URL.
   * `isCompletion` swaps in a "I beat level N" hook.
   */
  private buildShareText(isCompletion: boolean): string {
    const url = window.location.href;
    const fed = this.deerFed;
    const target = this.levelConfig.deerToFeed;
    const collected = this.journal.getCollectedCount();
    const title = this.currentTitle;
    if (isCompletion) {
      return [
        `🦌 我在《奈良公园·喂鹿》通关第 ${this.currentLevel} 关啦！`,
        `本关喂饱 ${fed}/${target} 只小鹿，图鉴已集齐 ${collected} 种，称号「${title}」`,
        `你能喂多少只？敢来挑战收集全图鉴吗？👇`,
        url,
      ].join('\n');
    }
    return [
      `🦌《奈良公园·喂鹿》– 治愈系收集挑战！`,
      `我正在第 ${this.currentLevel} 关，已喂饱 ${fed}/${target} 只小鹿，`,
      `图鉴集齐 ${collected} 种，称号「${title}」`,
      `稀有鹿和传说鹿超难靠近，看你能否集齐全部！来一起喂鹿 👇`,
      url,
    ].join('\n');
  }

  /**
   * True only when navigator.share is a real, working share function. WeChat's
   * built-in X5 browser exposes `navigator.share` as a property sometimes, but
   * calling it does nothing — so we also require the share function to look
   * like a function reference (not a no-op stub) and a modern mobile UA.
   */
  private canUseWebShare(): boolean {
    if (typeof navigator === 'undefined') return false;
    const share = (navigator as Navigator & { share?: unknown }).share;
    if (typeof share !== 'function') return false;
    const ua = navigator.userAgent || '';
    // WeChat / QQ in-app browsers expose a stub navigator.share that does
    // nothing — a plain web page can't programmatically trigger their native
    // share sheet, so we skip Web Share there and show the manual guide.
    if (/MicroMessenger|QQ\//.test(ua)) return false;
    // Desktop Chrome/Edge and mobile Safari/Chrome all support navigator.share
    // (over localhost/HTTPS), so we no longer gate on a mobile UA.
    return true;
  }

  /**
   * Pop the native OS share sheet via the Web Share API. Must be called from a
   * user gesture (the share button click). If the user cancels or the API is a
   * no-op that never resolves, the 4s timeout races it and we fall back to
   * copying the link to the clipboard.
   */
  private tryWebShare(text: string, url: string, onSuccess: () => void): void {
    this.hud.showToast('正在准备分享…');
    const sharePromise = navigator.share({ title: '奈良公园 - 喂鹿游戏', text, url });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('share-timeout')), 4000),
    );
    Promise.race([sharePromise, timeout])
      .then(() => onSuccess())
      .catch(() => {
        // User cancelled OR the API was a no-op — fall back to clipboard copy.
        this.doClipboardShare(text);
      });
  }

  /**
   * WeChat/QQ in-app browsers have no Web Share API and `navigator.clipboard`
   * is generally blocked. We can't programmatically open the share sheet, so
   * we show a clear, persistent guide pointing the user at the browser's
   * built-in share button.
   */
  private showShareGuide(text: string): void {
    // Best-effort copy so the user can paste. The async clipboard API is
    // blocked on insecure (HTTP) origins and in some in-app browsers, so fall
    // back to a hidden textarea + execCommand('copy') which works everywhere
    // a clipboard is reachable.
    this.copyTextQuietly(text);
    // Show a long-lived toast with concrete instructions.
    this.hud.showToast('点击右上角 ··· → 分享到朋友 / 朋友圈', 5000);
    // Also open an in-page guide card that explains what to do.
    this.openShareGuideCard(text);
  }

  /**
   * Try to copy `text` to the system clipboard. Returns true if anything
   * resembling a copy likely succeeded. Used by showShareGuide so the link is
   * pre-filled even on non-secure (HTTP) origins.
   */
  private copyTextQuietly(text: string): boolean {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => this.copyTextQuietlyExec(text));
      return true;
    }
    return this.copyTextQuietlyExec(text);
  }

  /** execCommand('copy') fallback for insecure origins. */
  private copyTextQuietlyExec(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.top = '0';
    textarea.style.left = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(textarea);
    return ok;
  }

  private openShareGuideCard(text: string): void {
    const existing = document.getElementById('share-guide-card');
    if (existing) {
      existing.classList.remove('hidden');
      return;
    }
    const card = document.createElement('div');
    card.id = 'share-guide-card';
    card.setAttribute('data-hide-on-hidden', '1');
    card.innerHTML = `
      <div class="share-guide-backdrop"></div>
      <div class="share-guide-panel" role="dialog" aria-label="分享指引">
        <h3>🦌 把奈良公园分享给好友</h3>
        <ol>
          <li>点击右上角 <b>···</b> 按钮</li>
          <li>选择 <b>分享到朋友</b> 或 <b>分享到朋友圈</b></li>
          <li>链接已自动复制，直接发送即可</li>
        </ol>
        <p class="share-guide-link" id="share-guide-link"></p>
        <button class="share-guide-close" type="button">知道了</button>
      </div>
    `;
    document.body.appendChild(card);
    const linkEl = card.querySelector('#share-guide-link') as HTMLElement | null;
    if (linkEl) {
      const short = text.length > 90 ? text.slice(0, 87) + '…' : text;
      linkEl.textContent = short;
    }
    const close = () => {
      card.classList.add('hidden');
    };
    card.querySelector('.share-guide-close')?.addEventListener('click', close);
    card.querySelector('.share-guide-backdrop')?.addEventListener('click', close);
  }

  private doClipboardShare(text: string): void {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => this.onShareSuccess(false))
        .catch(() => {
          this.fallbackShare(text);
        });
    } else {
      this.fallbackShare(text);
    }
  }

  private fallbackShare(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.top = '0';
    textarea.style.left = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    if (copied) {
      this.onShareSuccess(false);
    } else {
      // Final fallback: show the text in a toast so the user can copy it manually.
      const short = text.length > 80 ? text.slice(0, 77) + '…' : text;
      this.hud.showToast('请手动复制：' + short, 5000);
    }
  }

  doCompletionShare(): void {
    if (this.shareCooldown > 0) {
      this.hud.showToast(`分享冷却中…（${Math.ceil(this.shareCooldown)}s）`, 1200);
      return;
    }
    const url = window.location.href;
    const text = this.buildShareText(true);

    // 1) Web Share API — same native sheet as doShare().
    if (this.canUseWebShare()) {
      this.tryWebShare(text, url, () => this.onShareSuccess(true));
      return;
    }

    // 2) No native Web Share — same one-tap path as doShare(): reward +100 円
    //    immediately and pop the manual guide.
    this.onShareSuccess(true);
    this.showShareGuide(text);
  }

  /**
   * Fired on EVERY successful share (in-level or completion). Each share yields
   * 100 円 and counts toward the lifetime share total that unlocks titles.
   * A short cooldown prevents spam-clicking the button for infinite money.
   */
  private onShareSuccess(isCompletion: boolean): void {
    this.money += 100;
    this.totalShares += 1;
    this.saveTotalShares();
    if (isCompletion) {
      this.sharedBonusForNextLevel = true; // also fold a bonus into next level
    }
    const newTitle = this.computeTitle(this.totalShares);
    this.journal.setTitle(newTitle.name);
    if (newTitle.name !== this.currentTitle) {
      this.currentTitle = newTitle.name;
      this.hud.showToast(`🏆 解锁新称号：${newTitle.name}！${newTitle.desc}`, 4000);
    } else {
      this.hud.showToast(`分享成功！+100 円 🎉（累计分享 ${this.totalShares} 次）`);
    }
    this.shareCooldown = 4; // anti-spam cooldown (seconds)
  }

  private static readonly SHARE_TITLES: Array<{ min: number; name: string; desc: string }> = [
    { min: 0, name: '新手饲鹿人', desc: '初来奈良公园' },
    { min: 1, name: '初露锋芒', desc: '完成第一次分享' },
    { min: 3, name: '分享小能手', desc: '累计分享 3 次' },
    { min: 10, name: '鹿群挚友', desc: '累计分享 10 次' },
    { min: 25, name: '奈良百事通', desc: '累计分享 25 次' },
    { min: 50, name: '鹿仙·传说分享王', desc: '累计分享 50 次' },
  ];

  private computeTitle(shares: number): { name: string; desc: string } {
    let result = Game.SHARE_TITLES[0];
    for (const t of Game.SHARE_TITLES) {
      if (shares >= t.min) result = t;
    }
    return result;
  }

  private loadTotalShares(): number {
    try {
      const v = localStorage.getItem('naradeer_total_shares');
      return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
    } catch {
      return 0;
    }
  }

  private saveTotalShares(): void {
    try {
      localStorage.setItem('naradeer_total_shares', String(this.totalShares));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }

  private setupFeedInput(): void {
    window.addEventListener('keydown', (e) => {
      if (this.simonSays.isActive) {
        this.simonSays.handleKeyDown(e.code);
        return;
      }
      if (e.code === 'KeyE') {
        this.tryFeed();
      }
    });
  }

  private setupShareButton(): void {
    const btn = document.getElementById('share-button');
    if (!btn) return;
    // The button is already wired in main.ts so it works during the loading
    // phase — bail if so to avoid duplicate handlers.
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      this.audio.uiClick();
      this.doShare();
    });
  }

  private setupShop(): void {
    const openBtn = document.getElementById('shop-button');
    const overlay = document.getElementById('shop-overlay');
    const closeBtn = document.getElementById('shop-close');
    if (!openBtn || !overlay || !closeBtn) return;
    openBtn.addEventListener('click', () => {
      this.audio.uiClick();
      this.openShop();
    });
    closeBtn.addEventListener('click', () => {
      this.audio.uiClick();
      this.closeShop();
    });
    overlay.querySelector('.shop-backdrop')?.addEventListener('click', () => this.closeShop());
  }

  private openShop(): void {
    const overlay = document.getElementById('shop-overlay');
    if (!overlay) return;
    this.renderShop();
    overlay.classList.remove('hidden');
  }

  private closeShop(): void {
    document.getElementById('shop-overlay')?.classList.add('hidden');
  }

  /** Rebuild the shop grid + money display. Cheap enough for 6 items. */
  private renderShop(): void {
    const grid = document.getElementById('shop-grid');
    const moneyEl = document.getElementById('shop-money-count');
    if (!grid) return;
    if (moneyEl) moneyEl.textContent = String(this.money);
    grid.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const locked = this.currentLevel < item.unlockLevel;
      const owned = item.once === true && this.bikeActive;
      const afford = this.money >= item.cost;
      const card = document.createElement('div');
      card.className = 'shop-card' + (locked ? ' locked' : '') + (owned ? ' owned' : '');
      card.innerHTML =
        '<div class="shop-card-icon">' + item.icon + '</div>' +
        '<div class="shop-card-info">' +
          '<div class="shop-card-name">' + item.name +
            (locked ? ' <span class="shop-lock">🔒 L' + item.unlockLevel + '</span>' : '') +
          '</div>' +
          '<div class="shop-card-desc">' + item.desc + '</div>' +
        '</div>' +
        '<button type="button" class="shop-buy"' +
          (locked || owned || !afford ? ' disabled' : '') + '>' +
          (owned ? '已拥有' : (locked ? '未解锁' : ('💰 ' + item.cost))) +
        '</button>';
      const buyBtn = card.querySelector('.shop-buy') as HTMLButtonElement | null;
      if (buyBtn && !locked && !owned && afford) {
        buyBtn.addEventListener('click', () => this.buyItem(item));
      }
      grid.appendChild(card);
    }
  }

  private buyItem(item: ShopItemDef): void {
    const locked = this.currentLevel < item.unlockLevel;
    if (locked) { this.hud.showToast('该道具尚未解锁'); return; }
    if (item.once === true && this.bikeActive) { this.hud.showToast('已拥有该道具'); return; }
    if (this.money < item.cost) { this.hud.showToast('金钱不足！'); return; }
    this.money -= item.cost;
    this.audio.uiClick();
    this.applyItem(item.id);
    this.renderShop(); // refresh affordance + money
  }

  private applyItem(id: string): void {
    switch (id) {
      case 'whistle':   this.useWhistle(); break;
      case 'radar':     this.radarTimer = 30; this.hud.showToast('📡 雷达启动！30 秒内箭头指向最近未喂鹿'); break;
      case 'speed':     this.speedBoostTimer = 20; this.hud.showToast('💨 速度提升！20 秒移速 ×1.8'); break;
      case 'waterward': this.waterWardTimer = 60; this.hud.showToast('☂️ 避水护体！60 秒免疫水池'); break;
      case 'stealth':   this.stealthTimer = 15; this.hud.showToast('👘 隐身！15 秒内稀有 / 传说鹿不逃跑'); break;
      case 'bike':      this.bikeActive = true; this.hud.showToast('🚲 骑上环保自行车！本关移速 ×2.5'); break;
    }
  }

  /** Lure the nearest unfed, non-aggressive deer (up to 3) toward the player. */
  private useWhistle(): void {
    const pp = this.player.group.position;
    const candidates = this.deerList
      .filter((d) => d.canBeFed() && d.personality !== DeerPersonality.Aggressive)
      .map((d) => ({ d, dist: d.group.position.distanceTo(pp) }))
      .filter((x) => x.dist < 25)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    if (candidates.length === 0) {
      this.hud.showToast('附近没有可召唤的小鹿');
      return;
    }
    for (const c of candidates) c.d.whistleAttract();
    this.hud.showToast('🎵 鹿笛吹响！' + candidates.length + ' 只鹿正向你跑来');
  }

  private findNearestUnfedDeer(): Deer | null {
    const pp = this.player.group.position;
    let best: Deer | null = null;
    let bestDist = Infinity;
    for (const d of this.deerList) {
      if (!d.canBeFed()) continue;
      const dist = d.group.position.distanceTo(pp);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  private setupJournalInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.journal.toggle();
      }
    });
    // Mobile users have no Tab key — wire the journal hint chip in the HUD
    // so tapping it opens/closes the collection journal. The hint is already
    // wired in main.ts so it works during the loading phase; bail here if
    // it has been wired to avoid duplicate handlers.
    const hint = document.getElementById('journal-hint');
    if (hint && !hint.classList.contains('journal-hint-clickable')) {
      hint.classList.add('journal-hint-clickable');
      hint.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.audio.uiClick();
        this.journal.toggle();
      });
      hint.addEventListener('pointerdown', (e) => {
        // Prevent the click from also reaching the canvas/camera handler.
        e.stopPropagation();
      });
    }
  }

  private setupJournalShare(): void {
    const btn = document.getElementById('journal-share-button');
    if (!btn || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      this.audio.uiClick();
      this.journal.close();
      // Share from the codex: completion share when the level is done,
      // otherwise the in-level share.
      if (this.levelComplete) this.doCompletionShare();
      else this.doShare();
    });
  }

  private doFeed(deer: Deer): void {
    deer.startEating();
    this.deerFed++;
    this.crackerCount--;
    this.feedCooldown = 0.3;
    this.audio.feed(deer.group.position);
    this.hud.showToast('喂食成功！🦌');
    this.journal.markCollected(deer.index);

    const deerPos = deer.group.position.clone();
    const heartPos = deerPos.clone().add(new THREE.Vector3(0, 1, 0));
    // A burst of hearts + confetti so feeding feels rewarding (emotional value).
    this.particles.emitHeart(heartPos);
    this.particles.emitHeart(heartPos.clone().add(new THREE.Vector3(0.22, 0.25, 0.1)));
    this.particles.emitHeart(heartPos.clone().add(new THREE.Vector3(-0.22, 0.35, -0.1)));
    this.particles.emitPickup(deer.group.position.clone());
    this.particles.emitConfetti(heartPos);
    this.hud.flashPickup();

    // Legendary deer — extra payoff so the player *feels* the rarity.
    if (deer.rarity === DeerRarity.Legendary) {
      deer.triggerLegendaryFeedEffect();
      this.particles.emitRainbowBurst(heartPos);
      this.hud.showToast('✨ 传说之鹿！幸运加持！', 2500);
    }

    setTimeout(() => {
      if (deer.isHappy()) {
        this.audio.deerHappy(deer.group.position);
        const happyPos = deer.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        this.particles.emitHeart(happyPos);
        this.particles.emitHeart(happyPos.clone().add(new THREE.Vector3(0.28, 0.15, 0.2)));
        this.particles.emitConfetti(happyPos);
      }
    }, 2800);
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#87ceeb');
    this.scene.fog = new THREE.Fog('#c8e6c9', 80, 180);

    const hemisphere = new THREE.HemisphereLight('#b3d9ff', '#8d6e63', 1.2);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#ffe0b2', 1.8);
    sun.position.set(-8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight('#e3f2fd', 0.4);
    fill.position.set(6, 4, -4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight('#fff8e1', 0.3);
    rim.position.set(0, -1, 8);
    this.scene.add(rim);

    this.scene.add(this.player.group);
  }

  private createObstacles(): void {
    const f = contentScaleFor(getBoundsForLevel(1)); // created once, at level-1 size
    for (const def of OBSTACLES) {
      const obs = new Obstacle({ ...def, x: def.x * f, z: def.z * f });
      this.obstacles.push(obs);
      this.scene.add(obs.group);
    }
  }

  private createDeer(): void {
    const f = contentScaleFor(getBoundsForLevel(1)); // created once, at level-1 size
    for (const spawn of DEER_SPAWNS) {
      const position = new THREE.Vector3(spawn.x * f, 0, spawn.z * f);
      const deer = new Deer(this.deerList.length, position, { detectionRange: 4 + Math.random() * 2 });
      // Teach the tease rule via clear toasts: warn when the player starts to
      // leave an expectant deer, then explain when it actually gets angry.
      deer.onTease = (stage) => {
        if (stage === 'warning') this.hud.showToast('小鹿在等仙贝，走开它会生气哦！🦌');
        else this.hud.showToast('你没喂就走开了，小鹿生气了！下次靠近请喂食');
      };
      this.deerList.push(deer);
      this.scene.add(deer.group);
    }
  }

  private createVendors(): void {
    this.createVendorsForLevel(1);
  }

  private createVendorsForLevel(level: number): void {
    // Remove old vendors
    for (const v of this.vendors) {
      this.scene.remove(v.group);
    }
    this.vendors.length = 0;

    // Fewer stalls at higher levels so the game gets harder (less free food to
    // buy). Level 1 starts generous so the early game stays approachable; later
    // levels go sparse, nudging players toward sharing for the 100円 bonus.
    // From level 8 on there is only a single stall.
    const count = Math.max(1, 9 - level); // L1:8, L2:7 … L7:2, L8+:1
    const minDist = 10;
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < 300) {
      attempts++;
      const x = (Math.random() - 0.5) * this.currentBounds.halfWidth * 1.4;
      const z = (Math.random() - 0.5) * this.currentBounds.halfDepth * 1.4;
      // Keep the player's spawn point clear.
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
      let tooClose = false;
      for (const v of this.vendors) {
        const dx = v.group.position.x - x;
        const dz = v.group.position.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const vendor = new Vendor(x, z);
      this.vendors.push(vendor);
      this.scene.add(vendor.group);
      placed++;
    }
  }

  private setupMoneyTrees(): void {
    for (const mt of this.moneyTrees) {
      this.scene.remove(mt.sprite);
    }
    this.moneyTrees.length = 0;

    const count = this.currentLevel >= 3 ? 10 : 0;
    if (count === 0) return;

    const total = Math.min(this.levelConfig.moneyPool * 1.2, 400);
    const values: number[] = [];
    let remaining = Math.floor(total);
    for (let i = 0; i < count; i++) {
      if (i === count - 1) { values.push(remaining); break; }
      const avg = remaining / (count - i);
      const min = Math.max(5, Math.floor(avg * 0.5));
      const max = Math.max(min + 1, Math.floor(avg * 1.5));
      const v = min + Math.floor(Math.random() * (max - min));
      values.push(v);
      remaining -= v;
    }

    const infos = this.park.createMoneyTrees(count, values);
    for (const info of infos) {
      this.moneyTrees.push({ ...info, collected: false });
    }
  }

  private createChests(moneyPool: number): void {
    for (const chest of this.chests) {
      this.scene.remove(chest.group);
    }
    this.chests.length = 0;

    const f = contentScaleFor(this.currentBounds); // scale design-space spawns to the arena
    // Fewer chests at higher levels → less free money to pick up (difficulty ramp).
    const chestCount = Math.max(8, 25 - this.currentLevel * 2); // L1:23 … L9+:8
    const spawns = CHEST_SPAWNS.slice(0, chestCount);
    const moneyValues = distributeMoney(moneyPool, spawns.length);
    for (let i = 0; i < spawns.length; i++) {
      const chest = new TreasureChest(spawns[i].x * f, spawns[i].z * f, moneyValues[i]);
      this.chests.push(chest);
      this.scene.add(chest.group);
    }
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.deerFed,
      targetScore: this.levelConfig.deerToFeed,
      level: this.currentLevel,
      complete: this.levelComplete,
      feedableDeer: this.deerList.filter((d) => d.canBeFed()).length,
      player: {
        position: { x: this.player.group.position.x, y: this.player.group.position.y, z: this.player.group.position.z },
        speed: this.player.velocity.length(),
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
      camera: {
        position: {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
        },
        yaw: this.input.getCameraYaw(),
        pitch: this.input.getCameraPitch(),
      },
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
