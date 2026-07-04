import * as THREE from 'three';

export class TreasureChest {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  readonly moneyValue: number;
  collected = false;
  private bobOffset = Math.random() * Math.PI * 2;

  constructor(x: number, z: number, money?: number) {
    this.position = new THREE.Vector3(x, 0, z);
    this.group.position.set(x, 0, z);
    this.moneyValue = money ?? (15 + Math.floor(Math.random() * 36)); // 15~50

    // Chest body
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.7, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), bodyMat);
    body.position.y = 0.25;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Lid
    const lidMat = new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.6, metalness: 0.15 });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.37), lidMat);
    lid.position.y = 0.46;
    lid.castShadow = true;
    this.group.add(lid);

    // Metal bands
    const metalMat = new THREE.MeshStandardMaterial({ color: '#ffd54f', roughness: 0.3, metalness: 0.6 });
    for (let dx = -0.15; dx <= 0.15; dx += 0.3) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.36), metalMat);
      band.position.set(dx, 0.25, 0);
      this.group.add(band);
    }

    // Lock
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), metalMat);
    lock.position.set(0, 0.35, 0.18);
    this.group.add(lock);

    // Glow effect
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const ctx = glowCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
    gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.2, 1.2, 1);
    glow.position.y = 0.3;
    this.group.add(glow);

    // Money label
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 64;
    labelCanvas.height = 32;
    const lCtx = labelCanvas.getContext('2d')!;
    lCtx.fillStyle = '#ffd54f';
    lCtx.font = 'bold 20px sans-serif';
    lCtx.textAlign = 'center';
    lCtx.fillText(`${this.moneyValue}円`, 32, 22);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false }));
    label.scale.set(0.5, 0.25, 1);
    label.position.y = 0.8;
    this.group.add(label);
  }

  update(delta: number): void {
    if (this.collected) return;
    // Gentle bob
    this.bobOffset += delta * 2;
    this.group.position.y = Math.sin(this.bobOffset) * 0.05 + 0.1;
  }

  isPlayerNear(playerPos: THREE.Vector3): boolean {
    return !this.collected && this.group.position.distanceTo(playerPos) < 1.2;
  }

  collect(): number {
    if (this.collected) return 0;
    this.collected = true;
    this.group.visible = false;
    return this.moneyValue;
  }
}
