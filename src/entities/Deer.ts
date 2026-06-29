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
];

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

  fed = false;

  constructor(index: number, position: THREE.Vector3, tuning?: Partial<DeerTuning>) {
    this.index = index;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.homePosition = position.clone();
    this.wanderTarget = position.clone();

    // Body color
    const bodyColor = bodyColors[index % bodyColors.length];
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
      metalness: 0,
    });

    // ---- Body ----
    const bodyGeo = new THREE.BoxGeometry(0.45, 0.3, 0.65);
    // Round the body a bit
    const bodyPos = bodyGeo.attributes.position;
    for (let i = 0; i < bodyPos.count; i++) {
      const x = bodyPos.getX(i);
      const y = bodyPos.getY(i);
      const z = bodyPos.getZ(i);
      // Slight rounding
      bodyPos.setX(i, x * (1 - Math.abs(y) * 0.1));
      bodyPos.setZ(i, z * (1 - Math.abs(y) * 0.1));
    }
    bodyPos.needsUpdate = true;
    bodyGeo.computeVertexNormals();

    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.45;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.group.add(this.bodyMesh);

    // ---- Neck ----
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.5, -0.28);
    this.group.add(this.neck);

    const neckGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.2, 6);
    const neckMesh = new THREE.Mesh(neckGeo, bodyMat);
    neckMesh.position.y = 0.1;
    neckMesh.rotation.x = 0.3;
    neckMesh.castShadow = true;
    this.neck.add(neckMesh);

    // ---- Head ----
    this.head = new THREE.Group();
    this.head.position.set(0, 0.18, -0.05);
    this.neck.add(this.head);

    const headGeo = new THREE.BoxGeometry(0.1, 0.08, 0.16);
    const headMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
      metalness: 0,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.set(0, 0, -0.08);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Snout (lighter)
    const snoutMat = new THREE.MeshStandardMaterial({
      color: '#e8d5b7',
      roughness: 0.8,
      metalness: 0,
    });
    const snoutGeo = new THREE.SphereGeometry(0.035, 6, 6);
    const snout = new THREE.Mesh(snoutGeo, snoutMat);
    snout.position.set(0, -0.01, -0.16);
    snout.scale.set(1, 0.7, 1.3);
    this.head.add(snout);

    // Nose (black)
    const noseMat = new THREE.MeshStandardMaterial({
      color: '#1a1a1a',
      roughness: 0.5,
    });
    const noseGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.01, -0.19);
    this.head.add(nose);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({
      color: '#1a1a1a',
      roughness: 0.2,
    });
    for (let side = -1; side <= 1; side += 2) {
      const eyeGeo = new THREE.SphereGeometry(0.015, 6, 6);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.045, 0.02, -0.1);
      this.head.add(eye);

      // Eye highlight
      const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      const hlGeo = new THREE.SphereGeometry(0.005, 4, 4);
      const hl = new THREE.Mesh(hlGeo, highlightMat);
      hl.position.set(side * 0.048, 0.025, -0.09);
      this.head.add(hl);
    }

    // Ears
    const earMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
    });
    for (let side = -1; side <= 1; side += 2) {
      const earGeo = new THREE.ConeGeometry(0.025, 0.05, 4);
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(side * 0.055, 0.03, -0.03);
      ear.rotation.z = side * 0.3;
      ear.rotation.x = -0.2;
      this.head.add(ear);
    }

    // ---- Antlers (males) ----
    this.antlers = new THREE.Group();
    const antlerMat = new THREE.MeshStandardMaterial({
      color: '#6d4c41',
      roughness: 0.9,
      metalness: 0,
    });
    for (let side = -1; side <= 1; side += 2) {
      this.buildAntler(side, antlerMat);
    }
    this.antlers.position.set(0, 0.03, -0.04);
    this.head.add(this.antlers);

    // ---- Legs ----
    const legMat = new THREE.MeshStandardMaterial({
      color: bodyColor.clone().multiplyScalar(0.85),
      roughness: 0.8,
      metalness: 0,
    });
    const legGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.25, 5);

    this.legFL = new THREE.Mesh(legGeo, legMat);
    this.legFL.position.set(-0.12, 0.22, -0.18);
    this.legFL.castShadow = true;
    this.group.add(this.legFL);

    this.legFR = new THREE.Mesh(legGeo, legMat);
    this.legFR.position.set(0.12, 0.22, -0.18);
    this.legFR.castShadow = true;
    this.group.add(this.legFR);

    this.legBL = new THREE.Mesh(legGeo, legMat);
    this.legBL.position.set(-0.12, 0.22, 0.2);
    this.legBL.castShadow = true;
    this.group.add(this.legBL);

    this.legBR = new THREE.Mesh(legGeo, legMat);
    this.legBR.position.set(0.12, 0.22, 0.2);
    this.legBR.castShadow = true;
    this.group.add(this.legBR);

    // Hooves (darker)
    const hoofMat = new THREE.MeshStandardMaterial({
      color: '#3e2723',
      roughness: 0.9,
    });
    const hoofGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.03, 5);
    for (const legPos of [
      [-0.12, 0.34, -0.18],
      [0.12, 0.34, -0.18],
      [-0.12, 0.34, 0.2],
      [0.12, 0.34, 0.2],
    ]) {
      const hoof = new THREE.Mesh(hoofGeo, hoofMat);
      hoof.position.set(legPos[0], legPos[1], legPos[2]);
      this.group.add(hoof);
    }

    // ---- Tail ----
    const tailMat = new THREE.MeshStandardMaterial({
      color: '#f5f5f5',
      roughness: 0.9,
    });
    const tailGeo = new THREE.SphereGeometry(0.03, 5, 5);
    this.tail = new THREE.Mesh(tailGeo, tailMat);
    this.tail.position.set(0, 0.5, 0.32);
    this.tail.scale.set(0.8, 0.6, 1);
    this.group.add(this.tail);

    // ---- White patches (sika deer spots) ----
    if (index % 2 === 0) {
      const spotMat = new THREE.MeshStandardMaterial({
        color: '#f5f0e8',
        roughness: 0.8,
        transparent: true,
        opacity: 0.3,
      });
      for (let i = 0; i < 3; i++) {
        const spotGeo = new THREE.CircleGeometry(0.03 + Math.random() * 0.02, 5);
        const spot = new THREE.Mesh(spotGeo, spotMat);
        spot.position.set(
          (Math.random() - 0.5) * 0.3,
          0.5 + (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.4,
        );
        spot.rotation.x = -Math.PI / 2;
        this.group.add(spot);
      }
    }

    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
  }

  private buildAntler(side: number, mat: THREE.MeshStandardMaterial): void {
    // Main beam
    const points: THREE.Vector3[] = [];
    points.push(new THREE.Vector3(0, 0, 0));
    points.push(new THREE.Vector3(side * 0.04, 0.04, 0));
    points.push(new THREE.Vector3(side * 0.06, 0.07, 0));
    points.push(new THREE.Vector3(side * 0.05, 0.09, 0));

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 6, 0.006, 3, false);
    const antler = new THREE.Mesh(tubeGeo, mat);
    this.antlers.add(antler);

    // Branch
    const branchPoints: THREE.Vector3[] = [];
    branchPoints.push(new THREE.Vector3(side * 0.04, 0.04, 0));
    branchPoints.push(new THREE.Vector3(side * 0.07, 0.045, 0));
    branchPoints.push(new THREE.Vector3(side * 0.08, 0.04, 0));
    const branchCurve = new THREE.CatmullRomCurve3(branchPoints);
    const branchGeo = new THREE.TubeGeometry(branchCurve, 4, 0.004, 3, false);
    const branch = new THREE.Mesh(branchGeo, mat);
    this.antlers.add(branch);
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    const distToPlayer = this.group.position.distanceTo(playerPosition);

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
    this.legPhase += delta * (this.velocity.length() * 5 + 1);
    const legSwing = Math.sin(this.legPhase) * 0.08;
    this.legFL.position.x = -0.12 + legSwing * 0.5;
    this.legFR.position.x = 0.12 - legSwing * 0.5;
    this.legBL.position.x = -0.12 - legSwing * 0.5;
    this.legBR.position.x = 0.12 + legSwing * 0.5;

    // Tail wagging
    this.tail.rotation.x = Math.sin(Date.now() * 0.003 + this.index) * 0.1;

    // Apply position
    this.group.position.addScaledVector(this.velocity, delta);
  }

  private updateWander(delta: number, _playerPosition: THREE.Vector3, distToPlayer: number): void {
    // Move toward wander target
    const toTarget = new THREE.Vector3().copy(this.wanderTarget).sub(this.group.position);
    const distToTarget = toTarget.length();

    if (distToTarget < 0.3) {
      // Pick new wander target
      this.wanderTarget.set(
        this.homePosition.x + (Math.random() - 0.5) * this.tuning.wanderRadius,
        0,
        this.homePosition.z + (Math.random() - 0.5) * this.tuning.wanderRadius,
      );
    }

    // Check if player is close enough to approach
    if (distToPlayer < this.tuning.detectionRange && !this.fed) {
      this.state.current = DeerState.Approach;
      return;
    }

    // Move toward target
    const speed = this.tuning.wanderSpeed * (0.5 + Math.random() * 0.5);
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

    if (_distToPlayer < this.tuning.detectionRange && !this.fed) {
      this.state.current = DeerState.Approach;
      return;
    }

    if (this.state.timer <= 0) {
      this.state.current = DeerState.Wander;
    }
  }

  private updateApproach(delta: number, playerPosition: THREE.Vector3, _distToPlayer: number): void {
    // Walk toward player
    const toPlayer = new THREE.Vector3().copy(playerPosition).sub(this.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // Stop at a comfortable distance
    if (dist < 1.2) {
      this.state.current = DeerState.Bow;
      this.state.timer = this.tuning.bowDuration;
      this.velocity.set(0, 0, 0);
      return;
    }

    if (dist > this.tuning.detectionRange + 2) {
      this.state.current = DeerState.Wander;
      return;
    }

    const speed = this.tuning.approachSpeed * Math.min(dist / 3, 1);
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

    if (this.happyTimer <= 0) {
      this.state.current = DeerState.Wander;
      this.group.position.y = 0;
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
  }
}
