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
import { Park } from '../environment/Park';

const PARK_BOUNDS: ArenaBounds = {
  halfWidth: 120,
  halfDepth: 90,
};

// Deer spawn positions - scattered across larger map
const DEER_SPAWNS = [
  // Central area
  { x: -5, z: -3 },
  { x: 12, z: -8 },
  { x: -15, z: 10 },
  { x: 20, z: 15 },
  // North
  { x: -30, z: -25 },
  { x: 10, z: -35 },
  { x: -45, z: -10 },
  // East
  { x: 40, z: 5 },
  { x: 55, z: -20 },
  { x: 65, z: 30 },
  // South
  { x: -20, z: 40 },
  { x: 30, z: 50 },
  { x: -50, z: 55 },
  // West
  { x: -70, z: -5 },
  { x: -80, z: 30 },
  // Far corners
  { x: -90, z: -60 },
];

// Generate random obstacles
function generateObstacles(count: number): Array<{ x: number; z: number; rotation: number; width?: number }> {
  const obstacles: Array<{ x: number; z: number; rotation: number; width?: number }> = [];
  const minDist = 8; // Minimum distance between obstacles

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 50) {
      const x = (Math.random() - 0.5) * (PARK_BOUNDS.halfWidth * 1.6);
      const z = (Math.random() - 0.5) * (PARK_BOUNDS.halfDepth * 1.6);

      // Check distance from other obstacles
      let tooClose = false;
      for (const obs of obstacles) {
        const dx = obs.x - x;
        const dz = obs.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < minDist) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        obstacles.push({
          x,
          z,
          rotation: Math.random() * Math.PI,
          width: 0.6 + Math.random() * 0.8,
        });
        break;
      }
      attempts++;
    }
  }
  return obstacles;
}

const OBSTACLES = generateObstacles(40);

// Vendor positions - scattered near paths
const VENDOR_SPAWNS = [
  { x: 10, z: 0 },
  { x: -30, z: -20 },
  { x: 50, z: 25 },
  { x: -60, z: 40 },
  { x: 30, z: -45 },
];

// Generate random treasure chests
function generateChests(count: number): Array<{ x: number; z: number }> {
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
        if (Math.sqrt(dx * dx + dz * dz) < minDist) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        chests.push({ x, z });
        break;
      }
      attempts++;
    }
  }
  return chests;
}

const CHEST_SPAWNS = generateChests(25);

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
  private score = 0;
  private totalDeer = 0;
  private elapsed = 0;
  private complete = false;
  private readonly journal: Journal;
  private readonly obstacles: Obstacle[] = [];
  private readonly vendors: Vendor[] = [];
  private readonly chests: TreasureChest[] = [];
  private crackerCount = 3; // Start with 3 free crackers
  private money = 0;
  private obstacleNearby = false;
  private feedCooldown = 0;
  private readonly feedKeyPressed = new Set<string>();
  private nearestDeer: Deer | null = null;
  private nearestVendor: Vendor | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;
    // Enable shadows
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

    // Init systems
    this.particles = new ParticleSystem(this.scene);
    this.park = new Park(this.scene, PARK_BOUNDS);
    this.scene.add(this.park.group);

    this.createScene();
    this.createDeer();
    this.totalDeer = this.deerList.length;
    this.createObstacles();
    this.createVendors();
    this.createChests();

    // Journal - collect deer info for the encyclopedia
    this.journal = new Journal(
      this.deerList.map((d) => d.getDeerInfo()),
    );

    this.hud.setTarget(this.totalDeer);
    this.cameraRig.snapTo(this.player.group.position, this.input.getCameraYaw(), this.input.getCameraPitch());
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.publishDiagnostics();

    // Feed key handler (E key)
    this.setupFeedInput();
    // Journal toggle (Tab key)
    this.setupJournalInput();
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

    // Feed button for mobile
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

  start(): void {
    this.loop.start();
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
    if (!this.complete) this.elapsed += delta;

    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);

    // Feed cooldown
    if (this.feedCooldown > 0) this.feedCooldown -= delta;

    // Update player
    this.player.update(delta, elapsed, this.input, this.tuning, PARK_BOUNDS, this.input.getCameraYaw());

    // Update deer
    for (const deer of this.deerList) {
      deer.update(delta, this.player.group.position, this.crackerCount > 0);
    }

    // Obstacle collision
    this.obstacleNearby = false;
    const px = this.player.group.position.x;
    const pz = this.player.group.position.z;
    const playerRadius = 0.25;
    for (const obs of this.obstacles) {
      // Check if player is near obstacle (for jump hint)
      const nearMargin = 1.5;
      if (px > obs.minX - nearMargin && px < obs.maxX + nearMargin &&
          pz > obs.minZ - nearMargin && pz < obs.maxZ + nearMargin) {
        this.obstacleNearby = true;
      }
      // Collision when on ground
      if (this.player.isOnGround()) {
        const closestX = Math.max(obs.minX, Math.min(px, obs.maxX));
        const closestZ = Math.max(obs.minZ, Math.min(pz, obs.maxZ));
        const dx = px - closestX;
        const dz = pz - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < playerRadius * playerRadius) {
          // Push player out of obstacle
          const dist = Math.max(Math.sqrt(distSq), 0.001);
          const overlap = playerRadius - dist;
          const pushX = (dx / dist) * overlap;
          const pushZ = (dz / dist) * overlap;
          this.player.group.position.x += pushX;
          this.player.group.position.z += pushZ;
        }
      }
    }

    // Find nearest feedable deer
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

    // Check vendor proximity
    this.nearestVendor = null;
    for (const vendor of this.vendors) {
      if (vendor.isPlayerNear(this.player.group.position)) {
        this.nearestVendor = vendor;
        break;
      }
    }

    // Check chest collection
    for (const chest of this.chests) {
      chest.update(delta);
      if (chest.isPlayerNear(this.player.group.position)) {
        const money = chest.collect();
        if (money > 0) {
          this.money += money;
          this.audio.feed(); // Reuse feed sound for pickup
          this.particles.emitPickup(chest.group.position.clone());
        }
      }
    }

    // Update systems
    this.cameraRig.update(delta, this.player.group.position, this.tuning.cameraLag, this.input.getCameraYaw(), this.input.getCameraPitch());
    this.particles.update(delta);
    this.park.update(delta);
    this.hud.update(
      this.score,
      this.totalDeer,
      this.elapsed,
      this.complete,
      this.nearestDeer !== null && this.crackerCount > 0,
      this.journal.getCollectedCount(),
      this.obstacleNearby && this.player.isOnGround(),
      this.crackerCount,
      this.money,
      this.nearestVendor !== null,
    );

    // Check win
    if (this.score >= this.totalDeer && !this.complete) {
      this.complete = true;
      this.audio.victory();
      this.particles.emitConfetti(this.player.group.position.clone().add(new THREE.Vector3(0, 2, 0)));
    }

    this.publishDiagnostics();
  }

  private tryFeed(): void {
    if (this.feedCooldown > 0 || this.complete) return;

    // Try to buy from vendor first
    if (this.nearestVendor) {
      if (this.money >= 100) {
        this.money -= 100;
        this.crackerCount++;
        this.audio.feed();
        this.hud.showToast('购买成功！仙贝 +1');
        this.feedCooldown = 0.3;
      } else {
        this.audio.error();
        this.hud.showToast('金钱不足！需要100円');
        this.feedCooldown = 0.5;
      }
      return;
    }

    // Try to feed deer
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
    this.score += 1;
    this.crackerCount--;
    this.feedCooldown = 0.3;
    this.audio.feed();
    this.hud.showToast('喂食成功！🦌');
    this.journal.markCollected(deer.index);

    // Particle effects
    const deerPos = deer.group.position.clone();
    this.particles.emitHeart(deerPos.add(new THREE.Vector3(0, 1, 0)));
    this.particles.emitPickup(deer.group.position.clone());
    this.hud.flashPickup();

    // Happy buck
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
    // Sky - warm Japanese sunset gradient
    this.scene.background = new THREE.Color('#87ceeb');
    this.scene.fog = new THREE.Fog('#c8e6c9', 80, 180);

    // ---- Lighting ----
    const hemisphere = new THREE.HemisphereLight('#b3d9ff', '#8d6e63', 1.2);
    this.scene.add(hemisphere);

    // Warm sun
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

    // Fill light
    const fill = new THREE.DirectionalLight('#e3f2fd', 0.4);
    fill.position.set(6, 4, -4);
    this.scene.add(fill);

    // Ambient rim light
    const rim = new THREE.DirectionalLight('#fff8e1', 0.3);
    rim.position.set(0, -1, 8);
    this.scene.add(rim);

    // Add player to scene
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
      const deer = new Deer(
        this.deerList.length,
        position,
        { detectionRange: 4 + Math.random() * 2 },
      );
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

  private createChests(): void {
    for (const spawn of CHEST_SPAWNS) {
      const chest = new TreasureChest(spawn.x, spawn.z);
      this.chests.push(chest);
      this.scene.add(chest.group);
    }
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.score,
      targetScore: this.totalDeer,
      complete: this.complete,
      feedableDeer: this.deerList.filter((d) => d.canBeFed()).length,
      player: {
        position: {
          x: this.player.group.position.x,
          y: this.player.group.position.y,
          z: this.player.group.position.z,
        },
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
