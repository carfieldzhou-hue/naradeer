import * as THREE from 'three';
import { Tree } from './Tree';
import { ToriiGate, StoneLantern, Temple } from './Props';

export interface ParkBounds {
  halfWidth: number;
  halfDepth: number;
}

export class Park {
  readonly group = new THREE.Group();
  readonly trees: Tree[] = [];
  readonly lanterns: StoneLantern[] = [];
  readonly toriiGates: ToriiGate[] = [];
  private readonly temples: Temple[] = [];
  private readonly groundMesh: THREE.Mesh;
  private readonly groundTexture: THREE.CanvasTexture;
  private readonly waterMesh: THREE.Mesh;
  private waterTime = 0;
  private readonly flowerMeshes: THREE.Mesh[] = [];

  constructor(_scene: THREE.Scene, bounds: ParkBounds) {

    // ---- Ground ----
    this.groundTexture = this._groundTexture();
    this.groundTexture.wrapS = THREE.RepeatWrapping;
    this.groundTexture.wrapT = THREE.RepeatWrapping;
    this.groundTexture.repeat.set(8, 8);

    const groundMat = new THREE.MeshStandardMaterial({
      map: this.groundTexture,
      color: '#7cb342',
      roughness: 0.85,
      metalness: 0,
    });

    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.halfWidth * 2, bounds.halfDepth * 2, 1, 1),
      groundMat,
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.group.add(this.groundMesh);

    // ---- Dirt paths ----
    this._createPaths(bounds);

    // ---- Trees (Cherry blossoms) ----
    this._placeTrees(bounds);

    // ---- Stone Lanterns ----
    this._placeLanterns(bounds);

    // ---- Torii Gate ----
    const torii = new ToriiGate(new THREE.Vector3(0, 0, -bounds.halfDepth + 2), 1.2);
    this.toriiGates.push(torii);
    this.group.add(torii.group);

    // Another torii
    const torii2 = new ToriiGate(new THREE.Vector3(5, 0, -5), 0.8);
    this.toriiGates.push(torii2);
    this.group.add(torii2.group);

    // ---- Temple in background ----
    const temple = new Temple(new THREE.Vector3(-10, 0, -bounds.halfDepth + 3), 1.5);
    this.temples.push(temple);
    this.group.add(temple.group);

    // ---- Pond ----
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#4fc3f7',
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.7,
    });
    this.waterMesh = new THREE.Mesh(
      new THREE.CircleGeometry(2, 16),
      waterMat,
    );
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(-6, 0.02, 3);
    this.group.add(this.waterMesh);

    // Lotus leaves on pond
    const lotusMat = new THREE.MeshStandardMaterial({
      color: '#2e7d32',
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 5; i++) {
      const lotusGeo = new THREE.CircleGeometry(0.08 + Math.random() * 0.05, 6);
      const lotus = new THREE.Mesh(lotusGeo, lotusMat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.3 + Math.random() * 1.2;
      lotus.position.set(-6 + Math.cos(angle) * dist, 0.03, 3 + Math.sin(angle) * dist);
      this.group.add(lotus);
    }

    // ---- Flowers ----
    this._placeFlowers(bounds);

    // ---- Surrounding bushes ----
    this._placeBushes(bounds);
  }

  private _groundTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base green
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(0, 0, size, size);

    // Grass noise
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const shade = Math.random() * 30 - 15;
      const g = 179 + shade;
      ctx.fillStyle = `rgb(${Math.floor(124 + shade * 0.5)}, ${Math.min(255, Math.max(0, g))}, ${Math.floor(66 + shade * 0.3)})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Subtle grid pattern for scale
    ctx.strokeStyle = 'rgba(100, 150, 50, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private _createPaths(bounds: ParkBounds): void {
    const pathMat = new THREE.MeshStandardMaterial({
      color: '#a1887f',
      roughness: 0.9,
      metalness: 0,
    });

    // Main path (center)
    const mainPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, bounds.halfDepth * 2),
      pathMat,
    );
    mainPath.rotation.x = -Math.PI / 2;
    mainPath.position.y = 0.01;
    mainPath.receiveShadow = true;
    this.group.add(mainPath);

    // Cross path
    const crossPath = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.halfWidth * 2, 1.2),
      pathMat,
    );
    crossPath.rotation.x = -Math.PI / 2;
    crossPath.position.y = 0.01;
    crossPath.receiveShadow = true;
    this.group.add(crossPath);
  }

  private _placeTrees(_bounds: ParkBounds): void {
    // Cherry blossom tree positions
    const treePositions = [
      { x: -9, z: -5, scale: 1.2 },
      { x: -7, z: 2, scale: 1 },
      { x: -4, z: -7, scale: 0.9 },
      { x: 0, z: -6, scale: 1.1 },
      { x: 3, z: -7, scale: 0.8 },
      { x: 7, z: -5, scale: 1.0 },
      { x: 9, z: -2, scale: 1.1 },
      { x: 6, z: 3, scale: 0.9 },
      { x: -3, z: 5, scale: 1.0 },
      { x: 4, z: 6, scale: 1.2 },
      { x: 8, z: 5, scale: 0.8 },
      { x: -8, z: 6, scale: 1.0 },
      { x: -9, z: -1, scale: 0.9 },
      { x: 2, z: -3, scale: 0.7 },
      { x: -5, z: 0, scale: 1.0 },
    ];

    for (const pos of treePositions) {
      const tree = new Tree({
        position: new THREE.Vector3(pos.x, 0, pos.z),
        scale: pos.scale,
        canopySize: 1.0 + Math.random() * 0.3,
        trunkHeight: 0.8 + Math.random() * 0.4,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }
  }

  private _placeLanterns(_bounds: ParkBounds): void {
    const lanternPositions = [
      { x: -4, z: -4 },
      { x: 5, z: -3 },
      { x: -2, z: 4 },
      { x: 7, z: 2 },
      { x: -7, z: -2 },
    ];

    for (const pos of lanternPositions) {
      const lantern = new StoneLantern(
        new THREE.Vector3(pos.x, 0, pos.z),
        0.8 + Math.random() * 0.3,
      );
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }
  }

  private _placeFlowers(bounds: ParkBounds): void {
    const colors = ['#e91e63', '#f44336', '#ff5722', '#9c27b0', '#ff80ab'];

    for (let i = 0; i < 40; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0,
        side: THREE.DoubleSide,
      });

      const petalGeo = new THREE.CircleGeometry(0.03 + Math.random() * 0.02, 5);
      const flower = new THREE.Mesh(petalGeo, mat);
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.5;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.5;
      flower.position.set(x, 0.02, z);
      flower.rotation.x = -Math.PI / 2;
      flower.rotation.z = Math.random() * Math.PI;
      this.flowerMeshes.push(flower);
      this.group.add(flower);
    }
  }

  private _placeBushes(bounds: ParkBounds): void {
    const bushMat = new THREE.MeshStandardMaterial({
      color: '#558b2f',
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
    });

    for (let i = 0; i < 20; i++) {
      const bushGeo = new THREE.SphereGeometry(
        0.15 + Math.random() * 0.15,
        5, 4,
      );
      // Flatten
      const pos = bushGeo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.setY(j, pos.getY(j) * 0.5);
      }
      pos.needsUpdate = true;
      bushGeo.computeVertexNormals();

      const bush = new THREE.Mesh(bushGeo, bushMat);
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.6;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.6;
      // Avoid center area
      if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
      bush.position.set(x, 0.05, z);
      bush.castShadow = true;
      bush.receiveShadow = true;
      this.group.add(bush);
    }
  }

  update(delta: number): void {
    this.waterTime += delta;
    if (this.waterMesh) {
      this.waterMesh.position.y = 0.02 + Math.sin(this.waterTime * 0.5) * 0.005;
    }
  }

  dispose(): void {
    for (const tree of this.trees) tree.dispose();
    for (const lantern of this.lanterns) lantern.dispose();
    for (const torii of this.toriiGates) torii.dispose();
    for (const temple of this.temples) temple.dispose();
    this.groundTexture.dispose();
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
