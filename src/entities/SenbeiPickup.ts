import * as THREE from 'three';

export type SenbeiType = 'normal' | 'golden';

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 220, 120, 0.8)');
  gradient.addColorStop(0.3, 'rgba(255, 200, 80, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 200, 80, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const glowTexture = createGlowTexture();

export class SenbeiPickup {
  readonly group = new THREE.Group();
  collected = false;

  private readonly crackerGeo: THREE.BoxGeometry;
  private readonly crackerMat: THREE.MeshStandardMaterial;
  private readonly glowMat: THREE.SpriteMaterial;
  private readonly bobOffset: number;
  private time = 0;

  constructor(position: THREE.Vector3, type: SenbeiType = 'normal') {
    this.bobOffset = Math.random() * Math.PI * 2;

    const color = type === 'golden' ? '#ffd700' : '#ffcc80';
    const emissive = type === 'golden' ? '#ffa500' : '#cc8844';

    this.crackerMat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.3,
      roughness: 0.6,
      metalness: 0,
    });

    this.crackerGeo = new THREE.BoxGeometry(0.08, 0.012, 0.06);
    const cracker = new THREE.Mesh(this.crackerGeo, this.crackerMat);
    cracker.castShadow = true;
    this.group.add(cracker);

    this.glowMat = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      sizeAttenuation: true,
      opacity: 0.6,
    });
    const glow = new THREE.Sprite(this.glowMat);
    glow.position.y = 0.08;
    glow.scale.set(0.25, 0.25, 1);
    this.group.add(glow);

    this.group.position.copy(position);
  }

  update(delta: number, playerPosition: THREE.Vector3): boolean {
    if (this.collected) return false;

    this.time += delta;
    this.group.rotation.y += delta * 1.5;
    this.group.position.y = Math.sin(this.time * 2.5 + this.bobOffset) * 0.015;

    const dist = this.group.position.distanceTo(playerPosition);
    if (dist < 1.0) {
      this.collected = true;
      this.group.visible = false;
      return true;
    }

    return false;
  }

  dispose(): void {
    this.crackerGeo.dispose();
    this.crackerMat.dispose();
    this.glowMat.dispose();
  }
}
