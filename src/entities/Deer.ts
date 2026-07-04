import * as THREE from 'three';
import { cloneDeerTemplate, getAnimationClips } from './DeerModel';

// Deer state machine
export enum DeerState {
  Idle = 'idle',
  Wander = 'wander',
  Approach = 'approach',
  Bow = 'bow',
  Eating = 'eating',
  Happy = 'happy',
  Flee = 'flee',
  Angry = 'angry',
}

export enum DeerPersonality {
  Normal = 'normal',
  Shy = 'shy',
  Friendly = 'friendly',
  Playful = 'playful',
  Lazy = 'lazy',
}

export enum DeerRarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Legendary = 'legendary',
}

const PERSONALITY_BY_INDEX: DeerPersonality[] = [
  DeerPersonality.Playful,
  DeerPersonality.Shy,
  DeerPersonality.Friendly,
  DeerPersonality.Lazy,
  DeerPersonality.Normal,
  DeerPersonality.Shy,
  DeerPersonality.Friendly,
  DeerPersonality.Playful,
  DeerPersonality.Normal,
  DeerPersonality.Lazy,
  DeerPersonality.Shy,
  DeerPersonality.Friendly,
  DeerPersonality.Playful,
  DeerPersonality.Normal,
  DeerPersonality.Lazy,
  DeerPersonality.Shy,
];

const SPECIAL_VARIANT_BY_INDEX: string[] = [
  'none', 'none', 'none', 'none', 'none', 'none', 'none', 'golden',
  'none', 'none', 'none', 'none', 'none', 'butterfly', 'none', 'none',
];

const RARITY_BY_INDEX: DeerRarity[] = [
  DeerRarity.Common,     // 0  Playful
  DeerRarity.Common,     // 1  Shy
  DeerRarity.Common,     // 2  Friendly
  DeerRarity.Common,     // 3  Lazy
  DeerRarity.Common,     // 4  Normal
  DeerRarity.Uncommon,   // 5  Shy
  DeerRarity.Uncommon,   // 6  Friendly
  DeerRarity.Rare,       // 7  Playful (golden)
  DeerRarity.Common,     // 8  Normal
  DeerRarity.Uncommon,   // 9  Lazy
  DeerRarity.Uncommon,   // 10 Shy
  DeerRarity.Uncommon,   // 11 Friendly
  DeerRarity.Rare,       // 12 Playful
  DeerRarity.Rare,       // 13 Normal (butterfly)
  DeerRarity.Rare,       // 14 Lazy
  DeerRarity.Legendary,  // 15 Shy
];

// Deterministic gender for consistent journal
const GENDER_BY_INDEX: number[] = [
  0, 0, 1, 1, 0, 1, 0, 1,
  0, 1, 0, 0, 1, 0, 1, 1,  // 0=female, 1=male
];

const ANTLERS_BY_INDEX: boolean[] = [
  false, false, true, true, false, true, false, true,
  false, true, false, false, true, false, true, true,
];

export interface DeerTuning {
  wanderRadius: number;
  wanderSpeed: number;
  approachSpeed: number;
  detectionRange: number;
  bowDuration: number;
  eatDuration: number;
  happyDuration: number;
}

const DEFAULT_TUNING: DeerTuning = {
  wanderRadius: 30,      // Larger wander area for bigger map
  wanderSpeed: 0.6,      // Slightly slower for natural movement
  approachSpeed: 1.5,
  detectionRange: 5,
  bowDuration: 2,
  eatDuration: 2.5,
  happyDuration: 3,
};

function createFeedIndicatorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Outer glow
  ctx.beginPath();
  ctx.arc(32, 32, 22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 213, 79, 0.25)';
  ctx.fill();

  // Inner circle
  ctx.beginPath();
  ctx.arc(32, 32, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd54f';
  ctx.fill();
  ctx.strokeStyle = '#ff8a65';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // "!" icon
  ctx.fillStyle = '#5d4037';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 32, 30);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const feedIndicatorTexture = createFeedIndicatorTexture();

export class Deer {
  readonly group = new THREE.Group();
  readonly index: number;
  readonly state = { current: DeerState.Wander, timer: 0 };

  // FBX model
  private readonly modelRoot: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly walkAction: THREE.AnimationAction | null = null;
  private readonly headBone: THREE.Bone | null = null;

  // AI state
  private readonly tuning: DeerTuning;
  private wanderTarget = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly homePosition: THREE.Vector3;
  private eatingTimer = 0;
  private happyTimer = 0;
  private happyBob = 0;
  private angryTimer = 0;

  // Feed indicator (3D world-space prompt)
  private readonly feedIndicator: THREE.Sprite;

  // Visual variety
  readonly scaleFactor: number;
  readonly isMale: boolean;
  readonly hasAntlers: boolean;

  fed = false;
  available = true;
  readonly minLevel: number;

  readonly personality: DeerPersonality;
  readonly rarity: DeerRarity;
  readonly specialVariant: string;
  private friendlyFollowTimer = 0;
  private readonly prevPlayerPos = new THREE.Vector3();
  private readonly playerVel = new THREE.Vector3();
  private goldenGlow?: THREE.Sprite;
  private butterflyWingsGroup?: THREE.Group;

  constructor(index: number, position: THREE.Vector3, tuning?: Partial<DeerTuning>) {
    this.index = index;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.homePosition = position.clone();
    this.wanderTarget = position.clone();
    this.personality = PERSONALITY_BY_INDEX[index] ?? DeerPersonality.Normal;
    this.specialVariant = SPECIAL_VARIANT_BY_INDEX[index] ?? 'none';
    this.rarity = RARITY_BY_INDEX[index] ?? DeerRarity.Common;
    this.minLevel = this.rarity === DeerRarity.Legendary ? 4 : this.rarity === DeerRarity.Rare ? 3 : this.rarity === DeerRarity.Uncommon ? 2 : 1;
    this.isMale = GENDER_BY_INDEX[index] === 1;
    this.hasAntlers = ANTLERS_BY_INDEX[index];

    this.scaleFactor = 0.82 + Math.random() * 0.36; // 0.82 ~ 1.18
    // Clone FBX model and apply scale
    this.modelRoot = cloneDeerTemplate(this.scaleFactor);
    this.modelRoot.castShadow = true;
    this.modelRoot.receiveShadow = true;
    this.group.add(this.modelRoot);

    // ---- Visual differentiation ----
    this.applyVisualStyle();

    // Animation mixer
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    const clips = getAnimationClips();
    if (clips.length > 0) {
      this.walkAction = this.mixer.clipAction(clips[0]);
      this.walkAction.play();
      this.walkAction.time = Math.random() * clips[0].duration;
    }

    // Find head bone for head-tracking
    const foundBone = this.findHeadBone();
    this.headBone = foundBone;
    if (foundBone) {
      const r = foundBone.rotation;
      console.log(`[Deer ${index}] head bone: "${foundBone.name}" rot=(${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)})`);
    }

    // ---- Feed indicator (3D prompt) ----
    this.feedIndicator = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: feedIndicatorTexture,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
      }),
    );
    this.feedIndicator.position.y = 1.0;
    this.feedIndicator.scale.set(0.3, 0.3, 1);
    this.feedIndicator.visible = false;
    this.group.add(this.feedIndicator);

    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
  }

  private findHeadBone(): THREE.Bone | null {
    // Search by name first
    const bones: THREE.Bone[] = [];
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Bone) bones.push(child);
    });
    for (const b of bones) {
      const name = b.name.toLowerCase();
      if (name.includes('head') || name.includes('neck')) return b;
    }
    // Fallback: highest bone
    let highest: THREE.Bone | null = null;
    let highestY = -Infinity;
    for (const b of bones) {
      const worldPos = new THREE.Vector3();
      b.getWorldPosition(worldPos);
      if (worldPos.y > highestY) {
        highestY = worldPos.y;
        highest = b;
      }
    }
    return highest;
  }

  private applyVisualStyle(): void {
    // Color palette by personality
    const PERSONALITY_COLORS: Record<string, { tint: string; emissive?: string; emissiveIntensity?: number }> = {
      [DeerPersonality.Normal]:  { tint: '#ffffff' },  // No tint
      [DeerPersonality.Shy]:     { tint: '#e8d4f0' },  // Light purple
      [DeerPersonality.Friendly]:{ tint: '#d4e8f0' },  // Light blue
      [DeerPersonality.Playful]: { tint: '#f0e8d4' },  // Warm cream
      [DeerPersonality.Lazy]:    { tint: '#d4f0e8' },  // Mint green
    };

    // Rarity glow colors
    const RARITY_GLOW: Record<string, { color: string; intensity: number }> = {
      [DeerRarity.Common]:    { color: '#000000', intensity: 0 },
      [DeerRarity.Uncommon]:  { color: '#4fc3f7', intensity: 0.08 },  // Light blue
      [DeerRarity.Rare]:      { color: '#ba68c8', intensity: 0.12 },  // Purple
      [DeerRarity.Legendary]: { color: '#ffd54f', intensity: 0.18 },  // Gold
    };

    const personalityStyle = PERSONALITY_COLORS[this.personality] ?? PERSONALITY_COLORS[DeerPersonality.Normal];
    const rarityStyle = RARITY_GLOW[this.rarity] ?? RARITY_GLOW[DeerRarity.Common];

    // Apply color tint and emissive to all meshes
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.color = new THREE.Color(personalityStyle.tint);

        // Add emissive glow for rarity
        if (rarityStyle.intensity > 0) {
          mat.emissive = new THREE.Color(rarityStyle.color);
          mat.emissiveIntensity = rarityStyle.intensity;
        }
      }
    });

    // Add glow sprite for Uncommon+ rarity
    if (this.rarity !== DeerRarity.Common && this.specialVariant !== 'golden') {
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 128;
      glowCanvas.height = 128;
      const ctx = glowCanvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      const glowColor = rarityStyle.color;
      gradient.addColorStop(0, `${glowColor}59`);   // 35% opacity
      gradient.addColorStop(0.3, `${glowColor}1f`); // 12% opacity
      gradient.addColorStop(1, `${glowColor}00`);   // 0% opacity
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const glowScale = this.rarity === DeerRarity.Legendary ? 2.2 : this.rarity === DeerRarity.Rare ? 1.8 : 1.4;
      glow.scale.set(glowScale * this.scaleFactor, glowScale * this.scaleFactor, 1);
      glow.position.y = 0.02;
      this.goldenGlow = glow; // Reuse field for disposal
      this.group.add(glow);
    }

    // Special variant overrides
    if (this.specialVariant === 'golden') {
      this.modelRoot.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.emissive = new THREE.Color('#ffd700');
          mat.emissiveIntensity = 0.15;
        }
      });
      const gCanvas = document.createElement('canvas');
      gCanvas.width = 128;
      gCanvas.height = 128;
      const gCtx = gCanvas.getContext('2d')!;
      const grad = gCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255, 215, 0, 0.35)');
      grad.addColorStop(0.3, 'rgba(255, 215, 0, 0.12)');
      grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
      gCtx.fillStyle = grad;
      gCtx.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(gCanvas);
      this.goldenGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.goldenGlow.scale.set(2.5 * this.scaleFactor, 2.5 * this.scaleFactor, 1);
      this.goldenGlow.position.y = 0.02;
      this.group.add(this.goldenGlow);
    }

    if (this.specialVariant === 'butterfly') {
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(0.13, 0.05);
      wingShape.lineTo(0, 0.09);
      wingShape.closePath();
      const wMat1 = new THREE.MeshBasicMaterial({ color: 0xff69b4, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
      const wMat2 = new THREE.MeshBasicMaterial({ color: 0x9b59b6, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
      const wg = new THREE.ShapeGeometry(wingShape);
      const w1 = new THREE.Mesh(wg, wMat1);
      w1.position.set(-0.18 * this.scaleFactor, 0, 0);
      const w2 = new THREE.Mesh(wg.clone(), wMat2);
      w2.position.set(0.18 * this.scaleFactor, 0, 0);
      this.butterflyWingsGroup = new THREE.Group();
      this.butterflyWingsGroup.add(w1, w2);
      this.butterflyWingsGroup.position.set(0, 0.55 * this.scaleFactor, -0.05 * this.scaleFactor);
      this.group.add(this.butterflyWingsGroup);
    }
  }

  update(delta: number, playerPosition: THREE.Vector3, playerHasCrackers: boolean): void {
    // Advance animation mixer
    this.mixer.update(delta);

    // Control walk animation speed based on velocity
    if (this.walkAction) {
      const speed = this.velocity.length();
      const targetScale = speed > 0.01 ? 1.2 : 0;
      this.walkAction.timeScale += (targetScale - this.walkAction.timeScale) * Math.min(delta * 5, 1);
    }

    const distToPlayer = this.group.position.distanceTo(playerPosition);
    this.playerVel.copy(playerPosition).sub(this.prevPlayerPos).divideScalar(Math.max(delta, 0.001));
    this.prevPlayerPos.copy(playerPosition);

    // Check if player is near and has no crackers -> become angry
    if (distToPlayer < 1.5 && !playerHasCrackers && this.state.current !== DeerState.Eating && this.state.current !== DeerState.Happy && this.state.current !== DeerState.Angry) {
      this.state.current = DeerState.Angry;
      this.angryTimer = 1.5;
      // Push player away
      const pushDir = new THREE.Vector3().copy(playerPosition).sub(this.group.position);
      pushDir.y = 0;
      pushDir.normalize().multiplyScalar(-3); // Push away
      this.velocity.copy(pushDir);
    }

    // State machine
    switch (this.state.current) {
      case DeerState.Idle:
        this._updateIdle(delta, playerPosition, distToPlayer);
        break;
      case DeerState.Wander:
        this.updateWander(delta, playerPosition, distToPlayer);
        break;
      case DeerState.Approach:
        this.updateApproach(delta, playerPosition, distToPlayer);
        break;
      case DeerState.Bow:
        this.updateBow(delta);
        break;
      case DeerState.Eating:
        this.updateEating(delta);
        break;
      case DeerState.Happy:
        this.updateHappy(delta);
        break;
      case DeerState.Angry:
        this.updateAngry(delta);
        break;
      default:
        this.updateWander(delta, playerPosition, distToPlayer);
    }

    // Head tracking: look toward player when nearby, nod when happy
    if (this.headBone) {
      if (this.state.current === DeerState.Happy) {
        // Nod animation after feeding (forward nod, not backward)
        const nodSpeed = 8;
        const nodAmount = 0.25;
        this.happyBob += delta * nodSpeed;
        this.headBone.rotation.z = -Math.abs(Math.sin(this.happyBob)) * nodAmount;
        this.headBone.rotation.y += (0 - this.headBone.rotation.y) * delta * 3;
      } else if (distToPlayer < this.getDetectionRange() * 1.5) {
        const headWorld = new THREE.Vector3();
        this.headBone.getWorldPosition(headWorld);
        const toPlayer = new THREE.Vector3().copy(playerPosition).sub(headWorld);
        toPlayer.y = 0;
        if (toPlayer.lengthSq() > 0.01) {
          const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
          if (this.headBone.parent) {
            const parentWorld = new THREE.Vector3();
            this.headBone.parent.getWorldPosition(parentWorld);
            const parentDir = new THREE.Vector3().copy(headWorld).sub(parentWorld);
            const parentAngle = Math.atan2(parentDir.x, parentDir.z);
            let localAngle = targetAngle - parentAngle;
            localAngle = Math.max(-0.8, Math.min(0.8, localAngle));
            this.headBone.rotation.y += (localAngle - this.headBone.rotation.y) * delta * 4;
            this.headBone.rotation.x += (0 - this.headBone.rotation.x) * delta * 3;
            this.headBone.rotation.z += (0 - this.headBone.rotation.z) * delta * 3;
          }
        }
      } else {
        this.headBone.rotation.y += (0 - this.headBone.rotation.y) * delta * 2;
        this.headBone.rotation.x += (0 - this.headBone.rotation.x) * delta * 2;
        this.headBone.rotation.z += (0 - this.headBone.rotation.z) * delta * 2;
      }
    }

    // Feed indicator: show floating "!" above deer ready to be fed
    const showIndicator = this.state.current === DeerState.Bow && !this.fed;
    this.feedIndicator.visible = showIndicator;
    if (showIndicator) {
      this.feedIndicator.position.y = 1.0 + Math.sin(Date.now() * 0.004) * 0.06;
    }

    if (this.butterflyWingsGroup) {
      this.butterflyWingsGroup.rotation.y += delta * 1.5;
      this.butterflyWingsGroup.position.y = 0.55 + Math.sin(Date.now() * 0.003) * 0.04;
    }

    // Apply position
    this.group.position.addScaledVector(this.velocity, delta);
  }

  private updateWander(delta: number, _playerPosition: THREE.Vector3, distToPlayer: number): void {
    // Move toward wander target
    const toTarget = new THREE.Vector3().copy(this.wanderTarget).sub(this.group.position);
    const distToTarget = toTarget.length();

    if (distToTarget < 0.3) {
      // Rarity: rarer deer wander further from home, harder to find
      let rarityWanderMult = 1;
      switch (this.rarity) {
        case DeerRarity.Uncommon: rarityWanderMult = 1.4; break;
        case DeerRarity.Rare: rarityWanderMult = 1.8; break;
        case DeerRarity.Legendary: rarityWanderMult = 2.5; break;
      }
      const wr = this.tuning.wanderRadius * (this.personality === DeerPersonality.Lazy ? 0.5 : 1) * rarityWanderMult;
      this.wanderTarget.set(
        this.homePosition.x + (Math.random() - 0.5) * wr,
        0,
        this.homePosition.z + (Math.random() - 0.5) * wr,
      );
    }

    // Approach player when nearby and unfed
    if (distToPlayer < this.getDetectionRange() && !this.fed) {
      this.state.current = DeerState.Approach;
      return;
    }

    // Move toward target
    const wanderSpeedMult = this.personality === DeerPersonality.Playful ? 1.5 : this.personality === DeerPersonality.Lazy ? 0.4 : 1;
    const speed = this.tuning.wanderSpeed * wanderSpeedMult * (0.5 + Math.random() * 0.5);
    toTarget.normalize();
    this.velocity.lerp(toTarget.multiplyScalar(speed), delta * 3);

    // Face movement direction
    if (this.velocity.lengthSq() > 0.01) {
      const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
      let diff = targetAngle - this.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * delta * 4;
    }
  }

  private _updateIdle(delta: number, _playerPosition: THREE.Vector3, _distToPlayer: number): void {
    this.state.timer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 2);

    if (_distToPlayer < this.getDetectionRange() && !this.fed) {
      this.state.current = DeerState.Approach;
      return;
    }

    if (this.state.timer <= 0) {
      this.state.current = DeerState.Wander;
    }
  }

  private updateApproach(delta: number, playerPosition: THREE.Vector3, _distToPlayer: number): void {
    if (this.friendlyFollowTimer > 0) {
      this.friendlyFollowTimer -= delta;
      if (this.friendlyFollowTimer <= 0) {
        this.state.current = DeerState.Wander;
        this.velocity.set(0, 0, 0);
        return;
      }
      const followDist = this.group.position.distanceTo(playerPosition);
      if (followDist > 2.5) {
        const toPlayer = new THREE.Vector3().copy(playerPosition).sub(this.group.position);
        toPlayer.y = 0;
        toPlayer.normalize();
        this.velocity.lerp(toPlayer.multiplyScalar(this.tuning.approachSpeed * 1.3), delta * 3);
        const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
        let diff = targetAngle - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * delta * 5;
      } else {
        this.velocity.lerp(new THREE.Vector3(), delta * 3);
      }
      return;
    }

    // Rarer deer get spooked more easily
    const rarityFleeThreshold = this.rarity === DeerRarity.Legendary ? 1.5
      : this.rarity === DeerRarity.Rare ? 2.5
      : this.rarity === DeerRarity.Uncommon ? 3.5
      : 4;
    if ((this.personality === DeerPersonality.Shy || this.rarity === DeerRarity.Legendary) && this.playerVel.length() > rarityFleeThreshold) {
      this.state.current = DeerState.Wander;
      const fleeDir = new THREE.Vector3().copy(this.group.position).sub(playerPosition);
      fleeDir.y = 0;
      fleeDir.normalize();
      this.velocity.copy(fleeDir.multiplyScalar(this.tuning.wanderSpeed * 2));
      return;
    }

    // Walk toward player
    const toPlayer = new THREE.Vector3().copy(playerPosition).sub(this.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // Stop at a comfortable distance
    if (dist < 1.2) {
      this.state.current = DeerState.Bow;
      const bowMult = this.personality === DeerPersonality.Playful ? 0.6 : this.personality === DeerPersonality.Lazy ? 1.8 : 1;
      this.state.timer = this.tuning.bowDuration * bowMult;
      this.velocity.set(0, 0, 0);
      return;
    }

    if (dist > this.getDetectionRange() + 2) {
      this.state.current = DeerState.Wander;
      return;
    }

    const approachSpeedMult = this.personality === DeerPersonality.Shy ? 0.7 : this.personality === DeerPersonality.Friendly ? 1.3 : 1;
    const speed = this.tuning.approachSpeed * approachSpeedMult * Math.min(dist / 3, 1);
    toPlayer.normalize();
    this.velocity.lerp(toPlayer.multiplyScalar(speed), delta * 3);

    // Face player
    const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
    let diff = targetAngle - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * delta * 5;
  }

  private updateBow(delta: number): void {
    this.state.timer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 3);

    if (this.state.timer <= 0) {
      this.state.current = DeerState.Idle;
    }
  }

  private updateEating(delta: number): void {
    this.eatingTimer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 3);

    if (this.eatingTimer <= 0) {
      this.state.current = DeerState.Happy;
      this.happyTimer = this.tuning.happyDuration;
    }
  }

  private updateHappy(delta: number): void {
    this.happyTimer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 2);

    // Happy jump animation
    this.happyBob += delta * 6;
    this.group.position.y = Math.abs(Math.sin(this.happyBob)) * 0.12;

    if (this.happyTimer <= 0) {
      if (this.personality === DeerPersonality.Friendly) {
        this.state.current = DeerState.Approach;
        this.friendlyFollowTimer = 3;
      } else {
        this.state.current = DeerState.Wander;
      }
      this.group.position.y = 0;
    }
  }

  private updateAngry(delta: number): void {
    this.angryTimer -= delta;
    // Deer stamps and makes noise
    this.happyBob += delta * 12;
    this.group.position.y = Math.abs(Math.sin(this.happyBob)) * 0.08;

    // Face player while angry
    const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
    let diff = targetAngle - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * delta * 8;

    if (this.angryTimer <= 0) {
      this.state.current = DeerState.Wander;
      this.group.position.y = 0;
      this.velocity.set(0, 0, 0);
    }
  }

  // Call when player feeds the deer
  startEating(): void {
    this.state.current = DeerState.Eating;
    this.eatingTimer = this.tuning.eatDuration;
    this.fed = true;
  }

  reset(level: number): void {
    this.available = this.minLevel <= level;
    this.fed = false;
    this.group.visible = this.available;
    this.state.current = DeerState.Wander;
    this.state.timer = 0;
    this.eatingTimer = 0;
    this.happyTimer = 0;
    this.angryTimer = 0;
    this.group.position.copy(this.homePosition);
    this.velocity.set(0, 0, 0);
  }

  canBeFed(): boolean {
    return !this.fed && this.available;
  }

  isHappy(): boolean {
    return this.state.current === DeerState.Happy;
  }

  getDeerInfo(): { index: number; personality: DeerPersonality; rarity: DeerRarity; specialVariant: string; fed: boolean; name: string; isMale: boolean; hasAntlers: boolean } {
    let name: string;
    if (this.specialVariant === 'golden') {
      name = '小金子';
    } else if (this.specialVariant === 'butterfly') {
      name = '花仙子';
    } else {
      switch (this.personality) {
        case DeerPersonality.Normal:
          name = '小鹿';
          break;
        case DeerPersonality.Shy:
          name = '小害羞';
          break;
        case DeerPersonality.Friendly:
          name = '小跟班';
          break;
        case DeerPersonality.Playful:
          name = '小跳跳';
          break;
        case DeerPersonality.Lazy:
          name = '小懒懒';
          break;
      }
    }
    return {
      index: this.index,
      personality: this.personality,
      rarity: this.rarity,
      specialVariant: this.specialVariant,
      fed: this.fed,
      name: name!,
      isMale: this.isMale,
      hasAntlers: this.hasAntlers,
    };
  }

  private getDetectionRange(): number {
    let range = this.tuning.detectionRange;
    // Rarity: rarer deer are less likely to notice / approach the player
    switch (this.rarity) {
      case DeerRarity.Uncommon: range *= 0.8; break;
      case DeerRarity.Rare: range *= 0.6; break;
      case DeerRarity.Legendary: range *= 0.4; break;
    }
    if (this.personality === DeerPersonality.Shy) range *= 1.3;
    if (this.personality === DeerPersonality.Friendly) range *= 1.5;
    return range;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
    if (this.feedIndicator.material instanceof THREE.SpriteMaterial && this.feedIndicator.material.map) {
      this.feedIndicator.material.map.dispose();
    }
    if (this.goldenGlow) {
      this.goldenGlow.material.dispose();
      if (this.goldenGlow.material.map) this.goldenGlow.material.map.dispose();
    }
  }
}
