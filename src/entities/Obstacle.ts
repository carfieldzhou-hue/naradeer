import * as THREE from 'three';

export interface ObstacleDef {
  x: number;
  z: number;
  rotation?: number; // radians
  width?: number;
  type?: 'barrier' | 'fence' | 'wall';
}

export class Obstacle {
  readonly group = new THREE.Group();
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly height: number;

  // Bounding box (xz plane) for collision
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;

  constructor(def: ObstacleDef) {
    const obsType = def.type ?? 'barrier';
    const w = (def.width ?? 1.2) / 2;
    // depth varies by type
    const d = obsType === 'wall' ? 0.3 : obsType === 'fence' ? 0.08 : 0.12;
    // height varies by type
    const h = obsType === 'wall' ? 1.2 : obsType === 'fence' ? 1.0 : 0.22;
    this.halfWidth = w;
    this.halfDepth = d;
    this.height = h;

    const rot = def.rotation ?? 0;

    // Compute rotated AABB
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const corners = [
      { x: -w, z: -d }, { x: w, z: -d },
      { x: w, z: d }, { x: -w, z: d },
    ];
    let rMinX = Infinity, rMaxX = -Infinity, rMinZ = Infinity, rMaxZ = -Infinity;
    for (const c of corners) {
      const rx = c.x * cos - c.z * sin + def.x;
      const rz = c.x * sin + c.z * cos + def.z;
      if (rx < rMinX) rMinX = rx;
      if (rx > rMaxX) rMaxX = rx;
      if (rz < rMinZ) rMinZ = rz;
      if (rz > rMaxZ) rMaxZ = rz;
    }
    this.minX = rMinX;
    this.maxX = rMaxX;
    this.minZ = rMinZ;
    this.maxZ = rMaxZ;

    if (obsType === 'wall') {
      // Decorative stone wall
      const stoneMat = new THREE.MeshStandardMaterial({ color: '#78909c', roughness: 0.9, metalness: 0 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w * 2, h, d * 2), stoneMat);
      wall.position.y = h / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.group.add(wall);
      // Top cap
      const capMat = new THREE.MeshStandardMaterial({ color: '#546e7a', roughness: 0.8, metalness: 0.1 });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.05, 0.06, d * 2 + 0.05), capMat);
      cap.position.y = h + 0.03;
      cap.castShadow = true;
      this.group.add(cap);
    } else if (obsType === 'fence') {
      // Tall wooden fence
      const woodMat = new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.85, metalness: 0 });
      const darkMat = new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.9, metalness: 0 });
      // Vertical planks
      const plankCount = Math.max(3, Math.ceil(w * 2 / 0.25));
      for (let i = 0; i < plankCount; i++) {
        const px = -w + (i + 0.5) * (w * 2 / plankCount);
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, d * 2), woodMat);
        plank.position.set(px, h / 2, 0);
        plank.castShadow = true;
        plank.receiveShadow = true;
        this.group.add(plank);
      }
      // Horizontal rails
      for (const ry of [h * 0.3, h * 0.7]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.05, d * 2), darkMat);
        rail.position.set(0, ry, 0);
        rail.castShadow = true;
        this.group.add(rail);
      }
    } else {
      // Original barrier
      const woodMat = new THREE.MeshStandardMaterial({
        color: '#8d6e63',
        roughness: 0.85,
        metalness: 0,
      });
      const darkWoodMat = new THREE.MeshStandardMaterial({
        color: '#5d4037',
        roughness: 0.9,
        metalness: 0,
      });

      // Horizontal beam
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2, h * 0.5, d * 2), woodMat);
      beam.position.y = h * 0.4;
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.group.add(beam);

      // Two vertical posts
      for (let side = -1; side <= 1; side += 2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), darkWoodMat);
        post.position.set(side * (w - 0.08), h * 0.5, 0);
        post.castShadow = true;
        this.group.add(post);
      }

      // Top rail
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.04, d * 2), darkWoodMat);
      rail.position.y = h * 0.85;
      this.group.add(rail);
    }

    this.group.position.set(def.x, 0, def.z);
    this.group.rotation.y = rot;
  }
}
