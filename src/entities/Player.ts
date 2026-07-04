import * as THREE from 'three';
import type { InputController } from '../core/InputController';

export type PlayerTuning = {
  speed: number;
  dashMultiplier: number;
  acceleration: number;
};

export type ArenaBounds = {
  halfWidth: number;
  halfDepth: number;
};

export class Player {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();

  private readonly move = new THREE.Vector2();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly bodyGroup = new THREE.Group();

  // Body materials
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({
    color: '#e8c9a0',
    roughness: 0.6,
    metalness: 0,
  });
  private readonly clothesMaterial = new THREE.MeshStandardMaterial({
    color: '#f44336',
    roughness: 0.7,
    metalness: 0,
  });
  private readonly pantsMaterial = new THREE.MeshStandardMaterial({
    color: '#1a237e',
    roughness: 0.8,
    metalness: 0,
  });
  private readonly hatMaterial = new THREE.MeshStandardMaterial({
    color: '#4e342e',
    roughness: 0.7,
    metalness: 0,
  });
  private readonly shoeMaterial = new THREE.MeshStandardMaterial({
    color: '#212121',
    roughness: 0.9,
    metalness: 0,
  });
  private readonly beltMaterial = new THREE.MeshStandardMaterial({
    color: '#3e2723',
    roughness: 0.8,
    metalness: 0,
  });

  // Legs for walk animation
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly headNode: THREE.Group;

  // Cracker in hand
  private readonly crackerGroup: THREE.Group;
  private readonly crackerMat: THREE.MeshStandardMaterial;

  private walkPhase = 0;

  // Jump physics
  private verticalVelocity = 0;
  private onGround = true;
  private readonly jumpVelocity = 2.8;
  private readonly gravity = -14;

  constructor() {
    // Body (torso)
    const torsoGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.3, 8);
    const torso = new THREE.Mesh(torsoGeo, this.clothesMaterial);
    torso.position.y = 0.35;
    torso.castShadow = true;
    this.bodyGroup.add(torso);

    // Collar / neck
    const neckGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.04, 6);
    const neckMat = new THREE.MeshStandardMaterial({ color: '#e8c9a0', roughness: 0.6 });
    const neck = new THREE.Mesh(neckGeo, neckMat);
    neck.position.y = 0.52;
    this.bodyGroup.add(neck);

    // Head
    this.headNode = new THREE.Group();
    this.headNode.position.y = 0.56;
    this.bodyGroup.add(this.headNode);

    const headGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const head = new THREE.Mesh(headGeo, this.bodyMaterial);
    head.castShadow = true;
    this.headNode.add(head);

    // Hair
    const hairMat = new THREE.MeshStandardMaterial({
      color: '#3e2723',
      roughness: 0.9,
    });
    const hairGeo = new THREE.SphereGeometry(0.082, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 0.03;
    hair.scale.set(1, 0.6, 1);
    this.headNode.add(hair);

    // Hat (straw hat)
    const hatBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.12, 0.03, 8),
      this.hatMaterial,
    );
    hatBase.position.y = 0.07;
    this.headNode.add(hatBase);

    const hatTop = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.06, 8),
      this.hatMaterial,
    );
    hatTop.position.y = 0.08;
    this.headNode.add(hatTop);

    // Hat band
    const bandMat = new THREE.MeshStandardMaterial({ color: '#ffeb3b', roughness: 0.6 });
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.008, 4, 8),
      bandMat,
    );
    band.position.y = 0.04;
    band.rotation.x = Math.PI / 2;
    this.headNode.add(band);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a' });
    for (let side = -1; side <= 1; side += 2) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), eyeMat);
      eye.position.set(side * 0.035, 0.01, -0.07);
      this.headNode.add(eye);
    }

    // Arms
    this.armL = new THREE.Group();
    this.armL.position.set(-0.18, 0.42, 0);
    this.bodyGroup.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.18, 0.42, 0);
    this.bodyGroup.add(this.armR);

    const armMat = this.bodyMaterial;
    for (const arm of [this.armL, this.armR]) {
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 5), armMat);
      upperArm.position.y = -0.06;
      upperArm.rotation.z = 0.2;
      arm.add(upperArm);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.12, 5), armMat);
      forearm.position.set(0, -0.16, 0);
      forearm.rotation.z = 0.1;
      arm.add(forearm);
    }

    // Cracker in right hand
    this.crackerGroup = new THREE.Group();
    this.crackerMat = new THREE.MeshStandardMaterial({
      color: '#ffcc80',
      roughness: 0.7,
      metalness: 0,
    });
    const crackerGeo = new THREE.BoxGeometry(0.04, 0.01, 0.06);
    const cracker = new THREE.Mesh(crackerGeo, this.crackerMat);
    cracker.position.set(0, -0.22, 0.05);
    this.crackerGroup.add(cracker);

    // Cracker wrapper detail
    const wrapMat = new THREE.MeshStandardMaterial({ color: '#fff9c4', roughness: 0.5 });
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.003, 0.012), wrapMat);
    wrap.position.set(0, -0.22, 0.085);
    this.crackerGroup.add(wrap);

    this.armR.add(this.crackerGroup);

    // Legs
    this.legL = new THREE.Group();
    this.legL.position.set(-0.07, 0.2, 0);
    this.bodyGroup.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.07, 0.2, 0);
    this.bodyGroup.add(this.legR);

    for (const leg of [this.legL, this.legR]) {
      const legMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.035, 0.2, 5),
        this.pantsMaterial,
      );
      legMesh.position.y = -0.1;
      leg.add(legMesh);

      // Shoe
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.03, 0.05),
        this.shoeMaterial,
      );
      shoe.position.set(0, -0.2, 0.01);
      leg.add(shoe);
    }

    // Belt
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 8), this.beltMaterial);
    belt.position.y = 0.25;
    belt.rotation.x = Math.PI / 2;
    this.bodyGroup.add(belt);

    this.bodyGroup.position.y = 0.06;
    this.group.add(this.bodyGroup);
  }

  update(delta: number, _elapsed: number, input: InputController, tuning: PlayerTuning, bounds: ArenaBounds, cameraYaw: number): void {
    input.readMovement(this.move);
    const dash = input.isDashHeld() ? tuning.dashMultiplier : 1;

    // Rotate movement input relative to camera yaw
    // forward = (-sinθ, -cosθ), right = (cosθ, -sinθ)
    const sinYaw = Math.sin(cameraYaw);
    const cosYaw = Math.cos(cameraYaw);
    const worldX = this.move.x * cosYaw + this.move.y * sinYaw;
    const worldZ = -this.move.x * sinYaw + this.move.y * cosYaw;
    this.targetVelocity.set(worldX, 0, worldZ).multiplyScalar(tuning.speed * dash);

    // Rotate player body to face camera direction
    this.bodyGroup.rotation.y = cameraYaw;

    const smoothing = 1 - Math.exp(-tuning.acceleration * delta);
    this.velocity.lerp(this.targetVelocity, smoothing);

    // Jump
    if (input.consumeJump() && this.onGround) {
      this.verticalVelocity = this.jumpVelocity;
      this.onGround = false;
    }

    // Gravity
    if (!this.onGround) {
      this.verticalVelocity += this.gravity * delta;
      this.group.position.y += this.verticalVelocity * delta;
      // Ground collision
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.verticalVelocity = 0;
        this.onGround = true;
      }
    }

    this.group.position.addScaledVector(this.velocity, delta);

    // Bounds
    const halfW = bounds.halfWidth;
    const halfD = bounds.halfDepth;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -halfW + 0.8, halfW - 0.8);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -halfD + 0.8, halfD - 0.8);

    // Walk animation
    const moving = this.velocity.length() > 0.1;
    if (moving) {
      this.walkPhase += delta * this.velocity.length() * 4;
    }

    const swing = moving ? Math.sin(this.walkPhase) * 0.3 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.6;
    this.armR.rotation.x = swing * 0.6;

    // Slight body bob
    this.bodyGroup.position.y = 0.06 + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.03 : 0);
  }

  isOnGround(): boolean {
    return this.onGround;
  }

  getFeedPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.group.position.x,
      0.5,
      this.group.position.z,
    );
  }

  dispose(): void {
    this.bodyGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
    this.bodyMaterial.dispose();
    this.clothesMaterial.dispose();
    this.pantsMaterial.dispose();
    this.hatMaterial.dispose();
    this.shoeMaterial.dispose();
    this.beltMaterial.dispose();
    this.crackerMat.dispose();
  }
}
