import * as THREE from 'three';

export interface ObstacleDef {
  x: number;
  z: number;
  rotation?: number; // radians
  width?: number;
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
    const w = (def.width ?? 1.2) / 2;
    const d = 0.12; // depth of the beam
    const h = 0.22; // height of the barrier
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

    // Wood material
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

    this.group.position.set(def.x, 0, def.z);
    this.group.rotation.y = rot;
  }
}
