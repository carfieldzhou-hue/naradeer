import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Player, type ArenaBounds } from '../entities/Player';
import { Deer, DeerState } from '../entities/Deer';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Hud } from '../systems/Hud';
import { ParticleSystem } from '../systems/ParticleSystem';
import { Park } from '../environment/Park';

const PARK_BOUNDS: ArenaBounds = {
  halfWidth: 24,
  halfDepth: 18,
};

// Deer spawn positions (expanded for larger map)
const DEER_SPAWNS = [
  // Main plaza area
  { x: -5, z: -3 },
  { x: 4, z: -5 },
  { x: -3, z: 4 },
  { x: 6, z: 2 },
  { x: -7, z: 1 },
  { x: 2, z: -2 },
  { x: -4, z: -6 },
  { x: 0, z: 5 },
  // Pond garden area
  { x: -8, z: 9 },
  { x: 0, z: 12 },
  // Shrine corner
  { x: 14, z: 8 },
  { x: 18, z: 4 },
  // Bamboo grove
  { x: -10, z: -10 },
  // Hill viewpoint
  { x: -16, z: 0 },
  // Cherry avenue
  { x: 10, z: -8 },
  { x: 12, z: -14 },
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
  private feedCooldown = 0;
  private readonly feedKeyPressed = new Set<string>();
  private nearestDeer: Deer | null = null;

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

    this.hud.setTarget(this.totalDeer);
    this.cameraRig.snapTo(this.player.group.position);
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.publishDiagnostics();

    // Feed key handler (E key)
    this.setupFeedInput();
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
    this.player.update(delta, elapsed, this.input, this.tuning, PARK_BOUNDS);

    // Update deer
    for (const deer of this.deerList) {
      deer.update(delta, this.player.group.position);
    }

    // Find nearest feedable deer
    this.nearestDeer = null;
    let nearestDist = 2.5; // Max feed range
    for (const deer of this.deerList) {
      if (!deer.canBeFed() && deer.state.current !== DeerState.Bow) continue;
      const dist = deer.group.position.distanceTo(this.player.group.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        this.nearestDeer = deer;
      }
    }

    // Auto-feed check for deer that are bowing close enough
    if (this.feedCooldown <= 0 && this.nearestDeer && this.nearestDeer.canBeFed()) {
      // Auto-feed when deer is bowing and close
      this.doFeed(this.nearestDeer);
    }

    // Update systems
    this.cameraRig.update(delta, this.player.group.position, this.tuning.cameraLag);
    this.particles.update(delta);
    this.park.update(delta);
    this.hud.update(this.score, this.totalDeer, this.elapsed, this.complete, this.nearestDeer !== null);

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
    if (this.nearestDeer && this.nearestDeer.canBeFed()) {
      this.doFeed(this.nearestDeer);
    }
  }

  private doFeed(deer: Deer): void {
    deer.startEating();
    this.score += 1;
    this.feedCooldown = 0.3;
    this.audio.feed();

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
    this.scene.fog = new THREE.Fog('#c8e6c9', 30, 65);

    // ---- Lighting ----
    const hemisphere = new THREE.HemisphereLight('#b3d9ff', '#8d6e63', 1.2);
    this.scene.add(hemisphere);

    // Warm sun
    const sun = new THREE.DirectionalLight('#ffe0b2', 1.8);
    sun.position.set(-8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
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
