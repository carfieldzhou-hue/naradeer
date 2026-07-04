import * as THREE from 'three';
import { cloneVendorTemplate } from './VendorModel';

export class Vendor {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  private readonly interactionRange = 2.5;
  private promptSprite: THREE.Sprite;

  constructor(x: number, z: number) {
    this.position = new THREE.Vector3(x, 0, z);
    this.group.position.set(x, 0, z);

    // Load FBX model
    const model = cloneVendorTemplate();
    model.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(model);

    // Sign
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 128;
    signCanvas.height = 64;
    const ctx = signCanvas.getContext('2d')!;
    ctx.fillStyle = '#fff3e0';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#5d4037';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('鹿仙贝', 64, 25);
    ctx.fillText('100円/个', 64, 48);
    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true });
    const sign = new THREE.Sprite(signMat);
    sign.scale.set(0.6, 0.3, 1);
    sign.position.y = 2.0;
    this.group.add(sign);

    // Interaction prompt (hidden by default)
    const promptCanvas = document.createElement('canvas');
    promptCanvas.width = 128;
    promptCanvas.height = 64;
    const pCtx = promptCanvas.getContext('2d')!;
    pCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    pCtx.roundRect(0, 0, 128, 64, 8);
    pCtx.fill();
    pCtx.fillStyle = '#ffffff';
    pCtx.font = 'bold 18px sans-serif';
    pCtx.textAlign = 'center';
    pCtx.fillText('按 E 购买', 64, 28);
    pCtx.fillText('仙贝 +1 (100円)', 64, 50);
    const promptTex = new THREE.CanvasTexture(promptCanvas);
    this.promptSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: promptTex, transparent: true, depthTest: false }));
    this.promptSprite.scale.set(1.0, 0.5, 1);
    this.promptSprite.position.y = 2.5;
    this.promptSprite.visible = false;
    this.group.add(this.promptSprite);
  }

  isPlayerNear(playerPos: THREE.Vector3): boolean {
    const dist = this.group.position.distanceTo(playerPos);
    const near = dist < this.interactionRange;
    this.promptSprite.visible = near;
    return near;
  }
}
