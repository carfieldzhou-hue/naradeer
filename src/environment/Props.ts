import * as THREE from 'three';

// Shared materials
const woodMaterial = new THREE.MeshStandardMaterial({
  color: '#8d6e63',
  roughness: 0.85,
  metalness: 0,
});

const stoneMaterial = new THREE.MeshStandardMaterial({
  color: '#9e9e9e',
  roughness: 0.9,
  metalness: 0.05,
});

const roofMaterial = new THREE.MeshStandardMaterial({
  color: '#c62828',
  roughness: 0.7,
  metalness: 0.1,
});

const toriiRedMaterial = new THREE.MeshStandardMaterial({
  color: '#d32f2f',
  roughness: 0.6,
  metalness: 0,
});

const darkWoodMaterial = new THREE.MeshStandardMaterial({
  color: '#4e342e',
  roughness: 0.85,
  metalness: 0,
});

// --- Torii Gate ---
export class ToriiGate {
  readonly group = new THREE.Group();

  constructor(position: THREE.Vector3, scale = 1) {
    // Two vertical pillars
    const pillarGeo = new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 1.8 * scale, 8);
    const leftPillar = new THREE.Mesh(pillarGeo, toriiRedMaterial);
    leftPillar.position.set(-0.5 * scale, 0.9 * scale, 0);
    leftPillar.castShadow = true;
    this.group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, toriiRedMaterial);
    rightPillar.position.set(0.5 * scale, 0.9 * scale, 0);
    rightPillar.castShadow = true;
    this.group.add(rightPillar);

    // Top beam (curved)
    const topBeamGeo = new THREE.BoxGeometry(1.3 * scale, 0.08 * scale, 0.12 * scale);
    const topBeam = new THREE.Mesh(topBeamGeo, toriiRedMaterial);
    topBeam.position.set(0, 1.7 * scale, 0);
    topBeam.castShadow = true;
    this.group.add(topBeam);

    // Second beam (straight)
    const midBeamGeo = new THREE.BoxGeometry(1.15 * scale, 0.06 * scale, 0.1 * scale);
    const midBeam = new THREE.Mesh(midBeamGeo, toriiRedMaterial);
    midBeam.position.set(0, 1.3 * scale, 0);
    midBeam.castShadow = true;
    this.group.add(midBeam);

    // Center plaque
    const plaqueGeo = new THREE.PlaneGeometry(0.25 * scale, 0.15 * scale);
    const plaqueMat = new THREE.MeshStandardMaterial({
      color: '#fff8e1',
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(0, 1.5 * scale, 0.07 * scale);
    this.group.add(plaque);

    this.group.position.copy(position);
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }
}

// --- Stone Lantern (石灯籠) ---
export class StoneLantern {
  readonly group = new THREE.Group();

  constructor(position: THREE.Vector3, scale = 1) {
    // Base
    const baseGeo = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 0.08 * scale, 6);
    const base = new THREE.Mesh(baseGeo, stoneMaterial);
    base.position.y = 0.04 * scale;
    this.group.add(base);

    // Pedestal
    const pedestalGeo = new THREE.CylinderGeometry(0.1 * scale, 0.14 * scale, 0.2 * scale, 6);
    const pedestal = new THREE.Mesh(pedestalGeo, stoneMaterial);
    pedestal.position.y = 0.18 * scale;
    this.group.add(pedestal);

    // Middle post
    const postGeo = new THREE.CylinderGeometry(0.06 * scale, 0.07 * scale, 0.25 * scale, 6);
    const post = new THREE.Mesh(postGeo, stoneMaterial);
    post.position.y = 0.4 * scale;
    this.group.add(post);

    // Firebox platform
    const platformGeo = new THREE.CylinderGeometry(0.12 * scale, 0.14 * scale, 0.06 * scale, 6);
    const platform = new THREE.Mesh(platformGeo, stoneMaterial);
    platform.position.y = 0.56 * scale;
    this.group.add(platform);

    // Firebox
    const fireboxGeo = new THREE.BoxGeometry(0.16 * scale, 0.12 * scale, 0.16 * scale);
    const firebox = new THREE.Mesh(fireboxGeo, stoneMaterial);
    firebox.position.y = 0.65 * scale;
    this.group.add(firebox);

    // Opening
    const openingGeo = new THREE.BoxGeometry(0.08 * scale, 0.06 * scale, 0.02 * scale);
    const openingMat = new THREE.MeshStandardMaterial({
      color: '#ff8f00',
      emissive: '#ff6f00',
      emissiveIntensity: 0.5,
      roughness: 0.5,
    });
    const opening = new THREE.Mesh(openingGeo, openingMat);
    opening.position.set(0, 0.65 * scale, 0.09 * scale);
    this.group.add(opening);

    // Top roof
    const roofGeo = new THREE.CylinderGeometry(0.06 * scale, 0.16 * scale, 0.1 * scale, 6);
    const roof = new THREE.Mesh(roofGeo, stoneMaterial);
    roof.position.y = 0.76 * scale;
    this.group.add(roof);

    // Finial (jewel/ball on top)
    const finialGeo = new THREE.SphereGeometry(0.04 * scale, 6, 6);
    const finial = new THREE.Mesh(finialGeo, stoneMaterial);
    finial.position.y = 0.84 * scale;
    this.group.add(finial);

    this.group.position.copy(position);
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }
}

// --- Japanese Temple (distant) ---
export class Temple {
  readonly group = new THREE.Group();

  constructor(position: THREE.Vector3, scale = 1) {
    // Stone base
    const baseGeo = new THREE.BoxGeometry(2.5 * scale, 0.1 * scale, 1.8 * scale);
    const base = new THREE.Mesh(baseGeo, stoneMaterial);
    base.position.y = 0.05 * scale;
    base.receiveShadow = true;
    this.group.add(base);

    // Wooden walls
    const wallMat = darkWoodMaterial;
    const wallGeo = new THREE.BoxGeometry(2.2 * scale, 0.6 * scale, 1.4 * scale);
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = 0.4 * scale;
    walls.castShadow = true;
    this.group.add(walls);

    // Pillars at corners
    const pillarMat = woodMaterial;
    for (let x = -1; x <= 1; x += 2) {
      for (let z = -1; z <= 1; z += 2) {
        const pillarGeo = new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.7 * scale, 6);
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(x * 1.05 * scale, 0.45 * scale, z * 0.65 * scale);
        pillar.castShadow = true;
        this.group.add(pillar);
      }
    }

    // Roof (curved Japanese style)
    const roofShape = new THREE.Shape();
    const rw = 1.5 * scale;
    const rh = 0.15 * scale;
    roofShape.moveTo(-rw, 0);
    roofShape.quadraticCurveTo(-rw * 0.5, rh * 2.5, 0, rh * 2);
    roofShape.quadraticCurveTo(rw * 0.5, rh * 2.5, rw, 0);

    const extrudeSettings = {
      steps: 1,
      depth: 1.6 * scale,
      bevelEnabled: true,
      bevelThickness: 0.02 * scale,
      bevelSize: 0.02 * scale,
      bevelSegments: 3,
    };
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
    const roof = new THREE.Mesh(roofGeo, roofMaterial);
    roof.position.set(0, 0.85 * scale, -0.8 * scale);
    roof.castShadow = true;
    this.group.add(roof);

    // Roof ridge
    const ridgeGeo = new THREE.CylinderGeometry(0.03 * scale, 0.03 * scale, 1.8 * scale, 6);
    const ridge = new THREE.Mesh(ridgeGeo, new THREE.MeshStandardMaterial({ color: '#4e342e', roughness: 0.8 }));
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, 1.1 * scale, 0);
    this.group.add(ridge);

    // Eaves (curved ends)
    for (let z = -1; z <= 1; z += 2) {
      const eaveCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-1.2 * scale, 0.1, 0),
        new THREE.Vector3(0, 0.15, z * 0.1 * scale),
        new THREE.Vector3(1.2 * scale, 0.1, 0),
      );
      const eaveTube = new THREE.TubeGeometry(eaveCurve, 8, 0.03 * scale, 4, false);
      const eave = new THREE.Mesh(eaveTube, roofMaterial);
      eave.position.y = 0.95 * scale;
      this.group.add(eave);
    }

    // Door opening
    const doorMat = new THREE.MeshStandardMaterial({
      color: '#fff8e1',
      roughness: 0.6,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const doorGeo = new THREE.PlaneGeometry(0.3 * scale, 0.35 * scale);
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 0.38 * scale, 0.71 * scale);
    this.group.add(door);

    this.group.position.copy(position);
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
