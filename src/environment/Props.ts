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
// --- Bamboo Stalk ---
export class Bamboo {
  readonly group = new THREE.Group();

  constructor(position: THREE.Vector3, height = 1.4 + Math.random() * 1.2) {
    const greenMat = new THREE.MeshStandardMaterial({
      color: '#4caf50',
      roughness: 0.7,
      metalness: 0,
    });
    const darkGreenMat = new THREE.MeshStandardMaterial({
      color: '#388e3c',
      roughness: 0.8,
      metalness: 0,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: '#66bb6a',
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    const segments = 3;
    for (let i = 0; i < segments; i++) {
      const segHeight = height / segments;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.024, segHeight * 0.85, 6),
        greenMat,
      );
      seg.position.y = i * segHeight + segHeight * 0.4;
      seg.castShadow = true;
      this.group.add(seg);

      // Node ring
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.022, 0.003, 4, 6),
        darkGreenMat,
      );
      ring.position.y = (i + 0.85) * segHeight;
      ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
    }

    // Leaves at top
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(0.05 + Math.random() * 0.04, 0.1 + Math.random() * 0.08),
        leafMat,
      );
      const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.5;
      leaf.position.set(Math.cos(angle) * 0.02, height * 0.85 + Math.random() * height * 0.15, Math.sin(angle) * 0.02);
      leaf.rotation.x = (Math.random() - 0.5) * 0.4;
      leaf.rotation.y = angle;
      leaf.rotation.z = Math.random() * 0.3;
      this.group.add(leaf);
    }

    this.group.position.copy(position);
    // Random lean for natural look
    this.group.rotation.z = (Math.random() - 0.5) * 0.06;
    this.group.rotation.x = (Math.random() - 0.5) * 0.06;
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }
}

// --- Temple Bell (可敲的钟) ---
export class TempleBell {
  readonly group = new THREE.Group();

  constructor(position: THREE.Vector3, scale = 1) {
    // Frame posts
    const postMat = new THREE.MeshStandardMaterial({
      color: '#5d4037',
      roughness: 0.85,
      metalness: 0,
    });
    for (let x = -1; x <= 1; x += 2) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 1.6 * scale, 6),
        postMat,
      );
      post.position.set(x * 0.4 * scale, 0.8 * scale, 0);
      post.castShadow = true;
      this.group.add(post);
    }

    // Top beam
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(1.0 * scale, 0.06 * scale, 0.08 * scale),
      postMat,
    );
    beam.position.set(0, 1.55 * scale, 0);
    beam.castShadow = true;
    this.group.add(beam);

    // Roof
    const roofMat = new THREE.MeshStandardMaterial({
      color: '#8d6e63',
      roughness: 0.7,
      metalness: 0,
    });
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3 * scale, 0.5 * scale, 0.15 * scale, 6),
      roofMat,
    );
    roof.position.set(0, 1.7 * scale, 0);
    this.group.add(roof);

    // The bell
    const bellMat = new THREE.MeshStandardMaterial({
      color: '#bcaaa4',
      roughness: 0.4,
      metalness: 0.6,
    });
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 0.2 * scale, 8),
      bellMat,
    );
    bell.position.set(0, 1.05 * scale, 0);
    bell.castShadow = true;
    this.group.add(bell);

    // Bell striker rope
    const ropeMat = new THREE.MeshStandardMaterial({
      color: '#d7ccc8',
      roughness: 0.9,
    });
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008 * scale, 0.012 * scale, 0.25 * scale, 4),
      ropeMat,
    );
    rope.position.set(0, 0.85 * scale, 0.08 * scale);
    this.group.add(rope);

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

// --- Koi Fish (锦鲤, animated later) ---
export class KoiFish {
  readonly group = new THREE.Group();
  readonly swimPhase = Math.random() * Math.PI * 2;
  readonly swimRadius: number;
  readonly swimSpeed: number;

  constructor(position: THREE.Vector3, radius = 0.8 + Math.random() * 0.6) {
    this.swimRadius = radius;
    this.swimSpeed = 0.3 + Math.random() * 0.3;

    const colors = ['#ff5722', '#ff7043', '#ff8a65', '#ffab91', '#f44336', '#ff5252'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const fishMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.2,
    });

    // Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.04, 0.1, 6),
      fishMat,
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 0;
    this.group.add(body);

    // Tail
    const tailMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const tail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.025, 0.04),
      tailMat,
    );
    tail.position.set(0, 0, 0.06);
    tail.rotation.x = Math.PI / 4;
    this.group.add(tail);

    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }
}

// --- Viewing Platform (for hill viewpoint) ---
export class ViewingPlatform {
  readonly group = new THREE.Group();

  constructor(position: THREE.Vector3, scale = 1) {
    const woodMat = new THREE.MeshStandardMaterial({
      color: '#8d6e63',
      roughness: 0.85,
      metalness: 0,
    });

    // Platform floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(1.2 * scale, 0.06 * scale, 1.0 * scale),
      woodMat,
    );
    floor.position.y = 0.03 * scale;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Posts
    for (let x = -1; x <= 1; x += 2) {
      for (let z = -1; z <= 1; z += 2) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025 * scale, 0.03 * scale, 0.6 * scale, 5),
          woodMat,
        );
        post.position.set(x * 0.5 * scale, 0.33 * scale, z * 0.4 * scale);
        post.castShadow = true;
        this.group.add(post);
      }
    }

    // Railing
    for (let x = -1; x <= 1; x += 2) {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * scale, 0.015 * scale, 0.8 * scale * 0.9, 4),
        woodMat,
      );
      rail.rotation.z = Math.PI / 2;
      rail.position.set(x * 0.55 * scale, 0.6 * scale, 0);
      this.group.add(rail);
    }

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
