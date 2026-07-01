import * as THREE from 'three';

// Deer state machine
export enum DeerState {
  Idle = 'idle',
  Wander = 'wander',
  Approach = 'approach',
  Bow = 'bow',
  Eating = 'eating',
  Happy = 'happy',
  Flee = 'flee',
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
  wanderRadius: 8,
  wanderSpeed: 0.8,
  approachSpeed: 1.5,
  detectionRange: 5,
  bowDuration: 2,
  eatDuration: 2.5,
  happyDuration: 3,
};

// Shared geometry/materials for performance
const bodyColors = [
  new THREE.Color('#c68642'),
  new THREE.Color('#b87333'),
  new THREE.Color('#a0522d'),
  new THREE.Color('#d4a373'),
  new THREE.Color('#8b5e3c'),
  new THREE.Color('#cd853f'),
  new THREE.Color('#deb887'),
  new THREE.Color('#bc8f8f'),
  new THREE.Color('#c4a882'),
  new THREE.Color('#a0825a'),
];

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

  // Body parts for animation
  private readonly head: THREE.Group;
  private readonly neck: THREE.Group;
  private readonly bodyMesh: THREE.Mesh;
  private readonly legFL: THREE.Mesh;
  private readonly legFR: THREE.Mesh;
  private readonly legBL: THREE.Mesh;
  private readonly legBR: THREE.Mesh;
  private readonly tail: THREE.Mesh;
  private readonly legHooves: THREE.Mesh[] = [];

  // AI state
  private readonly tuning: DeerTuning;
  private wanderTarget = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly homePosition: THREE.Vector3;
  private eatingTimer = 0;
  private bowAngle = 0;
  private happyTimer = 0;
  private happyBob = 0;
  private legPhase = 0;

  // Antlers
  private readonly antlers: THREE.Group;
  private readonly hasAntlers: boolean;

  // Feed indicator (3D world-space prompt)
  private readonly feedIndicator: THREE.Sprite;

  private readonly legBaseX: [number, number, number, number];

  // Visual variety
  readonly scaleFactor: number;
  readonly isMale: boolean;

  fed = false;

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
    this.isMale = GENDER_BY_INDEX[index] === 1;
    this.hasAntlers = ANTLERS_BY_INDEX[index];

    // ---- Visual variety ----
    this.scaleFactor = 0.82 + Math.random() * 0.36; // 0.82 ~ 1.18

    const bodyWidth = 0.38 + Math.random() * 0.18;
    const bodyHeight = 0.24 + Math.random() * 0.14;
    const bodyDepth = 0.52 + Math.random() * 0.22;
    const legHeight = 0.2 + Math.random() * 0.1;
    const neckHeight = 0.16 + Math.random() * 0.08;

    // Body color
    const bodyColor = bodyColors[index % bodyColors.length];
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
      metalness: 0,
    });

    // ---- Body ----
    const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    // Round the body a bit
    const bodyPos = bodyGeo.attributes.position;
    for (let i = 0; i < bodyPos.count; i++) {
      const x = bodyPos.getX(i);
      const y = bodyPos.getY(i);
      const z = bodyPos.getZ(i);
      // Slight rounding based on height
      const rounding = 1 - Math.abs(y) * (0.08 + Math.random() * 0.06);
      bodyPos.setX(i, x * rounding);
      bodyPos.setZ(i, z * rounding);
    }
    bodyPos.needsUpdate = true;
    bodyGeo.computeVertexNormals();

    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = bodyHeight * 1.5;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.group.add(this.bodyMesh);

    // ---- Neck ----
    this.neck = new THREE.Group();
    this.neck.position.set(0, bodyHeight * 1.5, -bodyDepth * 0.43);
    this.group.add(this.neck);

    const neckGeo = new THREE.CylinderGeometry(0.05, 0.07, neckHeight, 6);
    const neckMesh = new THREE.Mesh(neckGeo, bodyMat);
    neckMesh.position.y = neckHeight * 0.5;
    neckMesh.rotation.x = 0.3;
    neckMesh.castShadow = true;
    this.neck.add(neckMesh);

    // ---- Head ----
    this.head = new THREE.Group();
    this.head.position.set(0, neckHeight + 0.02, -0.04);
    this.neck.add(this.head);

    const headWidth = 0.09 + Math.random() * 0.04;
    const headGeo = new THREE.BoxGeometry(headWidth, 0.07, 0.15);
    const headMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
      metalness: 0,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.set(0, 0, -0.07);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Snout (lighter)
    const snoutMat = new THREE.MeshStandardMaterial({
      color: '#e8d5b7',
      roughness: 0.8,
      metalness: 0,
    });
    const snoutGeo = new THREE.SphereGeometry(0.032, 6, 6);
    const snout = new THREE.Mesh(snoutGeo, snoutMat);
    snout.position.set(0, -0.01, -0.15);
    snout.scale.set(1, 0.7, 1.3);
    this.head.add(snout);

    // Nose (black)
    const noseMat = new THREE.MeshStandardMaterial({
      color: '#1a1a1a',
      roughness: 0.5,
    });
    const noseGeo = new THREE.SphereGeometry(0.018, 6, 6);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.01, -0.18);
    this.head.add(nose);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({
      color: '#1a1a1a',
      roughness: 0.2,
    });
    for (let side = -1; side <= 1; side += 2) {
      const eyeGeo = new THREE.SphereGeometry(0.014, 6, 6);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.042, 0.02, -0.09);
      this.head.add(eye);

      // Eye highlight
      const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      const hlGeo = new THREE.SphereGeometry(0.004, 4, 4);
      const hl = new THREE.Mesh(hlGeo, highlightMat);
      hl.position.set(side * 0.045, 0.024, -0.08);
      this.head.add(hl);
    }

    // Ears
    const earMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
    });
    for (let side = -1; side <= 1; side += 2) {
      const earGeo = new THREE.ConeGeometry(0.022, 0.045, 4);
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(side * 0.05, 0.03, -0.02);
      ear.rotation.z = side * 0.3;
      ear.rotation.x = -0.2;
      this.head.add(ear);
    }

    // ---- Antlers (males only) ----
    this.antlers = new THREE.Group();
    if (this.hasAntlers) {
      const antlerMat = new THREE.MeshStandardMaterial({
        color: '#6d4c41',
        roughness: 0.9,
        metalness: 0,
      });
      for (let side = -1; side <= 1; side += 2) {
        this.buildAntler(side, antlerMat, index);
      }
    }
    this.antlers.position.set(0, 0.03, -0.03);
    this.head.add(this.antlers);

    // ---- Legs ----
    const darkerColor = bodyColor.clone().multiplyScalar(0.85);
    const legMat = new THREE.MeshStandardMaterial({
      color: darkerColor,
      roughness: 0.8,
      metalness: 0,
    });
    const legGeo = new THREE.CylinderGeometry(0.022, 0.028, legHeight, 5);

    this.legFL = new THREE.Mesh(legGeo, legMat);
    this.legFL.position.set(-bodyWidth * 0.27, legHeight * 0.5, -bodyDepth * 0.28);
    this.legFL.castShadow = true;
    this.group.add(this.legFL);

    this.legFR = new THREE.Mesh(legGeo, legMat);
    this.legFR.position.set(bodyWidth * 0.27, legHeight * 0.5, -bodyDepth * 0.28);
    this.legFR.castShadow = true;
    this.group.add(this.legFR);

    this.legBL = new THREE.Mesh(legGeo, legMat);
    this.legBL.position.set(-bodyWidth * 0.27, legHeight * 0.5, bodyDepth * 0.3);
    this.legBL.castShadow = true;
    this.group.add(this.legBL);

    this.legBR = new THREE.Mesh(legGeo, legMat);
    this.legBR.position.set(bodyWidth * 0.27, legHeight * 0.5, bodyDepth * 0.3);
    this.legBR.castShadow = true;
    this.group.add(this.legBR);

    // Hooves (darker)
    const hoofMat = new THREE.MeshStandardMaterial({
      color: '#3e2723',
      roughness: 0.9,
    });
    const hoofGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.03, 5);
    const legPositions = [
      [-bodyWidth * 0.27, legHeight + 0.02, -bodyDepth * 0.28],
      [bodyWidth * 0.27, legHeight + 0.02, -bodyDepth * 0.28],
      [-bodyWidth * 0.27, legHeight + 0.02, bodyDepth * 0.3],
      [bodyWidth * 0.27, legHeight + 0.02, bodyDepth * 0.3],
    ] as const;
    for (const pos of legPositions) {
      const hoof = new THREE.Mesh(hoofGeo, hoofMat);
      hoof.position.set(pos[0], pos[1], pos[2]);
      this.legHooves.push(hoof);
      this.group.add(hoof);
    }

    this.legBaseX = [
      this.legFL.position.x,
      this.legFR.position.x,
      this.legBL.position.x,
      this.legBR.position.x,
    ];

    // ---- Tail ----
    const tailMat = new THREE.MeshStandardMaterial({
      color: '#f5f5f5',
      roughness: 0.9,
    });
    const tailGeo = new THREE.SphereGeometry(0.028, 5, 5);
    this.tail = new THREE.Mesh(tailGeo, tailMat);
    this.tail.position.set(0, bodyHeight * 1.6, bodyDepth * 0.5);
    this.tail.scale.set(0.8, 0.6, 1);
    this.group.add(this.tail);

    // ---- White patches (sika deer spots) ----
    if (index % 2 === 0) {
      const spotMat = new THREE.MeshStandardMaterial({
        color: '#f5f0e8',
        roughness: 0.8,
        transparent: true,
        opacity: 0.25,
      });
      for (let i = 0; i < 3; i++) {
        const spotGeo = new THREE.CircleGeometry(0.025 + Math.random() * 0.025, 5);
        const spot = new THREE.Mesh(spotGeo, spotMat);
        spot.position.set(
          (Math.random() - 0.5) * bodyWidth * 0.7,
          bodyHeight * 1.5 + (Math.random() - 0.5) * bodyHeight * 0.4,
          (Math.random() - 0.5) * bodyDepth * 0.6,
        );
        spot.rotation.x = -Math.PI / 2;
        this.group.add(spot);
      }
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

    if (this.specialVariant === 'golden') {
      bodyMat.emissive = new THREE.Color('#ffd700');
      bodyMat.emissiveIntensity = 0.15;
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
      this.goldenGlow.scale.set(2.5, 2.5, 1);
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
      w1.position.set(-0.18, 0, 0);
      const w2 = new THREE.Mesh(wg.clone(), wMat2);
      w2.position.set(0.18, 0, 0);
      this.butterflyWingsGroup = new THREE.Group();
      this.butterflyWingsGroup.add(w1, w2);
      this.butterflyWingsGroup.position.set(0, 0.55, -0.05);
      this.group.add(this.butterflyWingsGroup);
    }

    // Apply scale to the whole deer
    this.group.scale.set(this.scaleFactor, this.scaleFactor, this.scaleFactor);

    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
  }

  private buildAntler(side: number, mat: THREE.MeshStandardMaterial, seed: number): void {
    const variant = seed % 3;
    const spread = 0.04 + Math.random() * 0.03;

    if (variant === 0) {
      // Tall simple antler
      const points: THREE.Vector3[] = [];
      points.push(new THREE.Vector3(0, 0, 0));
      points.push(new THREE.Vector3(side * spread, 0.05, 0));
      points.push(new THREE.Vector3(side * spread * 1.3, 0.09, 0));
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 6, 0.006, 3, false);
      const antler = new THREE.Mesh(tubeGeo, mat);
      this.antlers.add(antler);

      // Single side branch
      const branchPoints: THREE.Vector3[] = [];
      branchPoints.push(new THREE.Vector3(side * spread, 0.05, 0));
      branchPoints.push(new THREE.Vector3(side * spread * 1.5, 0.055, 0));
      branchPoints.push(new THREE.Vector3(side * spread * 1.2, 0.045, 0));
      const branchCurve = new THREE.CatmullRomCurve3(branchPoints);
      const branchGeo = new THREE.TubeGeometry(branchCurve, 4, 0.004, 3, false);
      const branch = new THREE.Mesh(branchGeo, mat);
      this.antlers.add(branch);
    } else if (variant === 1) {
      // Wide antler with fork
      const points: THREE.Vector3[] = [];
      points.push(new THREE.Vector3(0, 0, 0));
      points.push(new THREE.Vector3(side * spread * 0.8, 0.04, 0));
      points.push(new THREE.Vector3(side * spread * 1.5, 0.075, 0));
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 6, 0.005, 3, false);
      const antler = new THREE.Mesh(tubeGeo, mat);
      this.antlers.add(antler);

      // Back branch
      const bPoints: THREE.Vector3[] = [];
      bPoints.push(new THREE.Vector3(side * spread * 0.6, 0.03, 0));
      bPoints.push(new THREE.Vector3(side * spread * 0.3, 0.06, side * -0.02));
      bPoints.push(new THREE.Vector3(side * spread * 0.1, 0.08, side * -0.03));
      const bCurve = new THREE.CatmullRomCurve3(bPoints);
      const bGeo = new THREE.TubeGeometry(bCurve, 4, 0.004, 3, false);
      const branch = new THREE.Mesh(bGeo, mat);
      this.antlers.add(branch);
    } else {
      // Short spike antler
      const points: THREE.Vector3[] = [];
      points.push(new THREE.Vector3(0, 0, 0));
      points.push(new THREE.Vector3(side * spread * 0.5, 0.04, 0));
      points.push(new THREE.Vector3(side * spread * 0.4, 0.065, 0));
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 5, 0.006, 3, false);
      const antler = new THREE.Mesh(tubeGeo, mat);
      this.antlers.add(antler);
    }
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    const distToPlayer = this.group.position.distanceTo(playerPosition);
    this.playerVel.copy(playerPosition).sub(this.prevPlayerPos).divideScalar(Math.max(delta, 0.001));
    this.prevPlayerPos.copy(playerPosition);

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
      default:
        this.updateWander(delta, playerPosition, distToPlayer);
    }

    // Animation - leg movement
    this.legPhase += delta * (this.velocity.length() * 5 + 1) * (this.personality === DeerPersonality.Playful ? 1.5 : 1);
    const legSwing = Math.sin(this.legPhase) * 0.06;
    this.legFL.position.x = this.legBaseX[0] + legSwing;
    this.legFR.position.x = this.legBaseX[1] - legSwing;
    this.legBL.position.x = this.legBaseX[2] - legSwing;
    this.legBR.position.x = this.legBaseX[3] + legSwing;

    // Tail wagging
    this.tail.rotation.x = Math.sin(Date.now() * 0.003 + this.index) * 0.1;

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

    // Check if player is close enough to approach
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
      const targetAngle = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI;
      let diff = targetAngle - this.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * delta * 4;
    }

    // Idle grazing occasionally
    if (Math.random() < 0.002) {
      this.state.current = DeerState.Idle;
      this.state.timer = 1 + Math.random() * 2;
    }
  }

  private _updateIdle(delta: number, _playerPosition: THREE.Vector3, _distToPlayer: number): void {
    this.state.timer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 2);

    // Head bob (grazing)
    this.neck.rotation.x = Math.sin(Date.now() * 0.002) * 0.05;

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
        const targetAngle = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI;
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
    const targetAngle = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI;
    let diff = targetAngle - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * delta * 5;
  }

  private updateBow(delta: number): void {
    this.state.timer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 3);

    // Head bow animation - lower head toward ground
    this.bowAngle = Math.min(this.bowAngle + delta * 2, 0.8);
    this.neck.rotation.x = this.bowAngle;

    if (this.state.timer <= 0) {
      this.state.current = DeerState.Idle;
      this.bowAngle = 0;
    }
  }

  private updateEating(delta: number): void {
    this.eatingTimer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 3);

    // Eating animation - head bobbing
    this.neck.rotation.x = 0.5 + Math.sin(Date.now() * 0.01) * 0.15;

    if (this.eatingTimer <= 0) {
      this.state.current = DeerState.Happy;
      this.happyTimer = this.tuning.happyDuration;
      this.neck.rotation.x = 0;
    }
  }

  private updateHappy(delta: number): void {
    this.happyTimer -= delta;
    this.velocity.lerp(new THREE.Vector3(), delta * 2);

    // Happy jump animation
    this.happyBob += delta * 6;
    this.group.position.y = Math.abs(Math.sin(this.happyBob)) * 0.12;

    // Tail wag faster
    this.tail.rotation.x = Math.sin(Date.now() * 0.01) * 0.3;

    // Head nodding - visible nod up and down
    this.neck.rotation.x = Math.sin(this.happyBob * 2.5) * 0.3;

    if (this.happyTimer <= 0) {
      if (this.personality === DeerPersonality.Friendly) {
        this.state.current = DeerState.Approach;
        this.friendlyFollowTimer = 3;
      } else {
        this.state.current = DeerState.Wander;
      }
      this.group.position.y = 0;
      this.neck.rotation.x = 0;
    }
  }

  // Call when player feeds the deer
  startEating(): void {
    this.state.current = DeerState.Eating;
    this.eatingTimer = this.tuning.eatDuration;
    this.fed = true;
    this.bowAngle = 0;
  }

  canBeFed(): boolean {
    return this.state.current === DeerState.Bow && !this.fed;
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
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
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
