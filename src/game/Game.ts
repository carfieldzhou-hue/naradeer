import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Player, type ArenaBounds } from '../entities/Player';
import { Deer } from '../entities/Deer';
import { Obstacle } from '../entities/Obstacle';
import { Vendor } from '../entities/Vendor';
import { TreasureChest } from '../entities/TreasureChest';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Journal } from '../systems/Journal';
import { Hud } from '../systems/Hud';
import { ParticleSystem } from '../systems/ParticleSystem';
import { Park, type MoneyTreeInfo } from '../environment/Park';

const PARK_BOUNDS: ArenaBounds = {
  halfWidth: 120,
  halfDepth: 90,
};

const DEER_SPAWNS = [
  { x: -5, z: -3 }, { x: 12, z: -8 }, { x: -15, z: 10 }, { x: 20, z: 15 },
  { x: -30, z: -25 }, { x: 10, z: -35 }, { x: -45, z: -10 },
  { x: 40, z: 5 }, { x: 55, z: -20 }, { x: 65, z: 30 },
  { x: -20, z: 40 }, { x: 30, z: 50 }, { x: -50, z: 55 },
  { x: -70, z: -5 }, { x: -80, z: 30 }, { x: -90, z: -60 },
];

function generateObstacles(count: number): Array<{ x: number; z: number; rotation: number; width?: number }> {
  const obstacles: Array<{ x: number; z: number; rotation: number; width?: number }> = [];
  const minDist = 8;
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 50) {
      const x = (Math.random() - 0.5) * (PARK_BOUNDS.halfWidth * 1.6);
      const z = (Math.random() - 0.5) * (PARK_BOUNDS.halfDepth * 1.6);
      let tooClose = false;
      for (const obs of obstacles) {
        const dx = obs.x - x;
        const dz = obs.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDist) { tooClose = true; break; }
      }
      if (!tooClose) {
        obstacles.push({ x, z, rotation: Math.random() * Math.PI, width: 0.6 + Math.random() * 0.8 });
        break;
      }
      attempts++;
    }
  }
  return obstacles;
}

const OBSTACLES = generateObstacles(40);

const VENDOR_SPAWNS = [
  { x: 10, z: 0 }, { x: -30, z: -20 }, { x: 50, z: 25 }, { x: -60, z: 40 }, { x: 30, z: -45 },
];

function generateChestSpawns(count: number): Array<{ x: number; z: number }> {
  const chests: Array<{ x: number; z: number }> = [];
  const minDist = 12;
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 50) {
      const x = (Math.random() - 0.5) * (PARK_BOUNDS.halfWidth * 1.4);
      const z = (Math.random() - 0.5) * (PARK_BOUNDS.halfDepth * 1.4);
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
  const moneyPool = Math.max(10, Math.floor(1000 / Math.pow(2, level - 1)));
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
  private readonly feedKeyPressed = new Set<string>();
  private nearestDeer: Deer | null = null;
  private nearestVendor: Vendor | null = null;
  private nearestMoneyTree: MoneyTreeInfo | null = null;
  private readonly moneyTrees: (MoneyTreeInfo & { collected: boolean })[] = [];
  private moneyTreeShakeTimer = 0;
  private moneyTreeShakeGroup: THREE.Group | null = null;
  private shareUsedThisLevel = false;

  private currentLevel = 1;
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
    const dashButton = this.getElement('#dash-button');
    this.input = new InputController(stick, knob, dashButton);

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.particles = new ParticleSystem(this.scene);
    this.park = new Park(this.scene, PARK_BOUNDS);
    this.scene.add(this.park.group);

    this.createScene();
    this.createDeer();
    this.createObstacles();
    this.createVendors();
    this.createChests(this.levelConfig.moneyPool);

    this.journal = new Journal(this.deerList.map((d) => d.getDeerInfo()));

    this.hud.setLevel(this.currentLevel, this.levelConfig.deerToFeed);
    this.cameraRig.snapTo(this.player.group.position, this.input.getCameraYaw(), this.input.getCameraPitch());
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.publishDiagnostics();
    this.setupFeedInput();
    this.setupJournalInput();
    this.setupLevelButtons();
    this.setupShareButton();
  }

  start(): void {
    this.loop.start();
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
      nextBtn.addEventListener('click', () => this.nextLevel());
    }
    const restartBtn = document.getElementById('restart-button');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restart());
    }
  }

  private startLevel(level: number): void {
    this.currentLevel = level;
    this.levelConfig = getLevelConfig(level);
    this.deerFed = 0;
    this.crackerCount = this.levelConfig.initialCrackers;
    this.money = 0;
    this.levelComplete = false;
    this.feedCooldown = 0;
    this.obstacleNearby = false;
    this.nearestDeer = null;
    this.nearestVendor = null;
    this.nearestMoneyTree = null;
    this.shareUsedThisLevel = false;
    this.moneyTreeShakeTimer = 0;
    this.moneyTreeShakeGroup = null;
    this.elapsed = 0;

    this.player.group.position.set(0, 0, 0);
    this.player.velocity.set(0, 0, 0);

    for (const deer of this.deerList) deer.reset();
    this.journal.reset();
    this.createChests(this.levelConfig.moneyPool);
    this.setupMoneyTrees();
    this.hud.setShareAvailable(!this.shareUsedThisLevel);

    this.hud.setLevel(level, this.levelConfig.deerToFeed);
    this.hud.hideCompletion();
    this.cameraRig.snapTo(this.player.group.position, this.input.getCameraYaw(), this.input.getCameraPitch());
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    this.particles.dispose();
    this.park.dispose();
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

    this.player.update(delta, elapsed, this.input, this.tuning, PARK_BOUNDS, this.input.getCameraYaw());

    for (const deer of this.deerList) {
      deer.update(delta, this.player.group.position, this.crackerCount > 0);
    }

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
          this.audio.feed();
          this.particles.emitPickup(chest.group.position.clone());
        }
      }
    }

    this.cameraRig.update(delta, this.player.group.position, this.tuning.cameraLag, this.input.getCameraYaw(), this.input.getCameraPitch());
    this.particles.update(delta);
    this.park.update(delta);
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
      !this.shareUsedThisLevel,
    );

    if (this.deerFed >= this.levelConfig.deerToFeed && !this.levelComplete) {
      this.levelComplete = true;
      this.audio.victory();
      this.particles.emitConfetti(this.player.group.position.clone().add(new THREE.Vector3(0, 2, 0)));
    }

    this.publishDiagnostics();
  }

  private tryFeed(): void {
    if (this.feedCooldown > 0 || this.levelComplete) return;

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

    if (this.nearestDeer && this.nearestDeer.canBeFed()) {
      if (this.crackerCount > 0) {
        this.doFeed(this.nearestDeer);
      } else {
        this.audio.error();
        this.hud.showToast('没有仙贝了！先去小摊购买');
        this.feedCooldown = 0.5;
      }
    }
  }

  doShare(): void {
    if (this.shareUsedThisLevel || this.levelComplete) return;
    const url = window.location.href;
    const shareData = { title: '奈良公园 - 喂鹿游戏', text: '来奈良公园喂鹿吧！我正在挑战第 ' + this.currentLevel + ' 关！', url };

    if (navigator.share) {
      navigator.share(shareData).then(() => {
        this.rewardShare();
      }).catch(() => {
        // User cancelled
      });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        this.rewardShare();
      }).catch(() => {
        this.hud.showToast('复制链接失败');
      });
    }
  }

  private rewardShare(): void {
    if (this.shareUsedThisLevel) return;
    this.shareUsedThisLevel = true;
    this.money += 100;
    this.audio.feed();
    this.hud.showToast('分享成功！获得 100 円 🎉');
    this.hud.setShareAvailable(false);
  }

  private setupFeedInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') {
        this.feedKeyPressed.add('keyboard');
        this.tryFeed();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyE') {
        this.feedKeyPressed.delete('keyboard');
      }
    });

    const feedBtn = document.getElementById('feed-button');
    if (feedBtn) {
      feedBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.feedKeyPressed.add('mobile');
        this.tryFeed();
      });
      feedBtn.addEventListener('pointerup', () => {
        this.feedKeyPressed.delete('mobile');
      });
      feedBtn.addEventListener('pointerleave', () => {
        this.feedKeyPressed.delete('mobile');
      });
    }
  }

  private setupShareButton(): void {
    const btn = document.getElementById('share-button');
    if (btn) {
      btn.addEventListener('click', () => this.doShare());
    }
  }

  private setupJournalInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.journal.toggle();
      }
    });
  }

  private doFeed(deer: Deer): void {
    deer.startEating();
    this.deerFed++;
    this.crackerCount--;
    this.feedCooldown = 0.3;
    this.audio.feed();
    this.hud.showToast('喂食成功！🦌');
    this.journal.markCollected(deer.index);

    const deerPos = deer.group.position.clone();
    this.particles.emitHeart(deerPos.add(new THREE.Vector3(0, 1, 0)));
    this.particles.emitPickup(deer.group.position.clone());
    this.hud.flashPickup();

    setTimeout(() => {
      if (deer.isHappy()) {
        this.audio.deerHappy();
        this.particles.emitHeart(deer.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
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
    for (const def of OBSTACLES) {
      const obs = new Obstacle(def);
      this.obstacles.push(obs);
      this.scene.add(obs.group);
    }
  }

  private createDeer(): void {
    for (const spawn of DEER_SPAWNS) {
      const position = new THREE.Vector3(spawn.x, 0, spawn.z);
      const deer = new Deer(this.deerList.length, position, { detectionRange: 4 + Math.random() * 2 });
      this.deerList.push(deer);
      this.scene.add(deer.group);
    }
  }

  private createVendors(): void {
    for (const spawn of VENDOR_SPAWNS) {
      const vendor = new Vendor(spawn.x, spawn.z);
      this.vendors.push(vendor);
      this.scene.add(vendor.group);
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

    const moneyValues = distributeMoney(moneyPool, CHEST_SPAWNS.length);
    for (let i = 0; i < CHEST_SPAWNS.length; i++) {
      const chest = new TreasureChest(CHEST_SPAWNS[i].x, CHEST_SPAWNS[i].z, moneyValues[i]);
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
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
