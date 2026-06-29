import * as THREE from 'three';

const trunkMaterial = new THREE.MeshStandardMaterial({
  color: '#5d4037',
  roughness: 0.9,
  metalness: 0,
});

const canopyColor1 = new THREE.Color('#f8bbd0');
const canopyColor2 = new THREE.Color('#f48fb1');
const canopyColor3 = new THREE.Color('#f06292');

export interface TreeParams {
  position: THREE.Vector3;
  scale?: number;
  canopySize?: number;
  trunkHeight?: number;
}

export class Tree {
  readonly group = new THREE.Group();

  constructor(params: TreeParams) {
    const { position, scale = 1, canopySize = 1, trunkHeight = 1 } = params;

    // Trunk - tapered cylinder
    const trunkGeo = new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, trunkHeight * scale, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMaterial);
    trunk.position.y = (trunkHeight * scale) / 2;
    trunk.castShadow = true;
    this.group.add(trunk);

    // Main canopy - large sphere with offset
    const canopyGeo = new THREE.SphereGeometry(0.6 * canopySize * scale, 8, 7);
    // Slightly flatten
    const positions = canopyGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) * 0.7);
    }
    positions.needsUpdate = true;
    canopyGeo.computeVertexNormals();

    const canopyMat = new THREE.MeshStandardMaterial({
      color: canopyColor1,
      roughness: 0.8,
      metalness: 0,
      flatShading: true,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = (trunkHeight + 0.3) * scale;
    canopy.position.x = (Math.random() - 0.5) * 0.1;
    canopy.position.z = (Math.random() - 0.5) * 0.1;
    canopy.castShadow = true;
    this.group.add(canopy);

    // Secondary canopy clumps
    for (let i = 0; i < 2; i++) {
      const clumpGeo = new THREE.SphereGeometry(0.35 * canopySize * scale * (0.7 + Math.random() * 0.3), 6, 5);
      const clumpPos = clumpGeo.attributes.position;
      for (let j = 0; j < clumpPos.count; j++) {
        clumpPos.setY(j, clumpPos.getY(j) * 0.6);
      }
      clumpPos.needsUpdate = true;
      clumpGeo.computeVertexNormals();

      const clumpMat = new THREE.MeshStandardMaterial({
        color: i === 0 ? canopyColor2 : canopyColor3,
        roughness: 0.85,
        metalness: 0,
        flatShading: true,
      });
      const clump = new THREE.Mesh(clumpGeo, clumpMat);
      const angle = (i / 2) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 0.3 * scale;
      clump.position.set(
        Math.cos(angle) * dist,
        (trunkHeight + 0.1 + Math.random() * 0.2) * scale,
        Math.sin(angle) * dist,
      );
      clump.castShadow = true;
      this.group.add(clump);
    }

    this.group.position.copy(position);

    // Random slight rotation
    this.group.rotation.y = Math.random() * Math.PI * 2;

    // Random scale variation
    const s = 0.85 + Math.random() * 0.3;
    this.group.scale.set(s, s, s);
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
