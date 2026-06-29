import * as THREE from 'three';

export type ParticleType = 'cherryBlossom' | 'heart' | 'pickup' | 'confetti';

export class ParticleSystem {
  private readonly scene: THREE.Scene;
  private readonly emitters: Emitter[] = [];

  // Cherry blossom particle system (continuous)
  private blossomParticles: THREE.Points | null = null;
  private blossomPositions: Float32Array | null = null;
  private blossomVelocities: Float32Array | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initBlossom();
  }

  private initBlossom(): void {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 10 + 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

      velocities[i * 3] = (Math.random() - 0.5) * 0.15;
      velocities[i * 3 + 1] = -(Math.random() * 0.3 + 0.1);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;

      sizes[i] = 0.03 + Math.random() * 0.05;

      colors[i * 3] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.25;
      colors[i * 3 + 2] = 0.6 + Math.random() * 0.2;
    }

    this.blossomPositions = positions;
    this.blossomVelocities = velocities;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Petal shape using a small plane
    const petalTexture = this.createPetalTexture();
    const mat = new THREE.PointsMaterial({
      size: 0.08,
      map: petalTexture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.NormalBlending,
      depthWrite: false,
      vertexColors: true,
    });

    this.blossomParticles = new THREE.Points(geo, mat);
    this.scene.add(this.blossomParticles);
  }

  private createPetalTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;

    // Draw a small petal shape
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(8, 8, 4, 2.5, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  update(delta: number): void {
    // Update cherry blossom
    if (this.blossomParticles && this.blossomPositions && this.blossomVelocities) {
      const pos = this.blossomParticles.geometry.attributes.position as THREE.BufferAttribute;
      const array = pos.array as Float32Array;

      for (let i = 0; i < array.length / 3; i++) {
        // Add wind-like sway
        this.blossomVelocities[i * 3] += (Math.random() - 0.5) * 0.05;
        this.blossomVelocities[i * 3] *= 0.98;
        this.blossomVelocities[i * 3 + 2] += (Math.random() - 0.5) * 0.05;
        this.blossomVelocities[i * 3 + 2] *= 0.98;

        array[i * 3] += this.blossomVelocities[i * 3] * delta;
        array[i * 3 + 1] += this.blossomVelocities[i * 3 + 1] * delta;
        array[i * 3 + 2] += this.blossomVelocities[i * 3 + 2] * delta;

        // Reset when below ground
        if (array[i * 3 + 1] < 0) {
          array[i * 3] = (Math.random() - 0.5) * 40;
          array[i * 3 + 1] = Math.random() * 8 + 3;
          array[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
      }

      pos.needsUpdate = true;
    }

    // Update one-shot emitters
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const emitter = this.emitters[i];
      emitter.life -= delta;
      if (emitter.life <= 0) {
        this.removeEmitter(i);
        continue;
      }
      emitter.update(delta);
    }
  }

  // One-shot effect emitters
  emitHeart(position: THREE.Vector3): void {
    const emitter = new HeartEmitter(this.scene, position);
    this.emitters.push(emitter);
  }

  emitPickup(position: THREE.Vector3): void {
    const emitter = new PickupEmitter(this.scene, position);
    this.emitters.push(emitter);
  }

  emitConfetti(position: THREE.Vector3): void {
    const emitter = new ConfettiEmitter(this.scene, position);
    this.emitters.push(emitter);
  }

  private removeEmitter(index: number): void {
    const emitter = this.emitters[index];
    emitter.dispose();
    this.emitters.splice(index, 1);
  }

  dispose(): void {
    if (this.blossomParticles) {
      this.blossomParticles.geometry.dispose();
      (this.blossomParticles.material as THREE.PointsMaterial).dispose();
      this.scene.remove(this.blossomParticles);
    }
    for (const emitter of this.emitters) {
      emitter.dispose();
    }
    this.emitters.length = 0;
  }
}

// Base emitter class
interface Emitter {
  life: number;
  update(delta: number): void;
  dispose(): void;
}

class HeartEmitter implements Emitter {
  life = 1.5;
  private readonly particles: THREE.Points;
  private readonly velocities: Float32Array;
  private readonly startPositions: Float32Array;
  private count: number;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.count = 8;
    const positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.startPositions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      const angle = (i / this.count) * Math.PI * 2;
      const speed = 0.8 + Math.random() * 0.5;
      this.velocities[i * 3] = Math.cos(angle) * speed;
      this.velocities[i * 3 + 1] = Math.sin(angle) * speed + 1.0;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;

      this.startPositions[i * 3] = position.x;
      this.startPositions[i * 3 + 1] = position.y;
      this.startPositions[i * 3 + 2] = position.z;

      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      sizes[i] = 0.06 + Math.random() * 0.04;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.2 + Math.random() * 0.2;
      colors[i * 3 + 2] = 0.3 + Math.random() * 0.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.06,
      color: '#ff1744',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geo, mat);
    scene.add(this.particles);
  }

  update(delta: number): void {
    this.life -= delta;
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const array = pos.array as Float32Array;

    const fade = Math.min(this.life / 0.5, 1);
    (this.particles.material as THREE.PointsMaterial).opacity = fade * 0.9;

    for (let i = 0; i < this.count; i++) {
      array[i * 3] = this.startPositions[i * 3] + this.velocities[i * 3] * (1.5 - this.life) * 2;
      array[i * 3 + 1] = this.startPositions[i * 3 + 1] + this.velocities[i * 3 + 1] * (1.5 - this.life) * 2 - 0.5 * (1.5 - this.life) ** 2;
      array[i * 3 + 2] = this.startPositions[i * 3 + 2] + this.velocities[i * 3 + 2] * (1.5 - this.life) * 2;
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.particles.geometry.dispose();
    (this.particles.material as THREE.PointsMaterial).dispose();
    this.particles.parent?.remove(this.particles);
  }
}

class PickupEmitter implements Emitter {
  life = 0.6;
  private readonly particles: THREE.Points;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    const count = 6;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions[i * 3] = position.x + Math.cos(angle) * 0.1;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z + Math.sin(angle) * 0.1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      color: '#ffd54f',
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geo, mat);
    scene.add(this.particles);
  }

  update(_delta: number): void {
    const fade = this.life / 0.6;
    (this.particles.material as THREE.PointsMaterial).opacity = fade;
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const array = pos.array as Float32Array;
    for (let i = 0; i < array.length / 3; i++) {
      const angle = (i / (array.length / 3)) * Math.PI * 2;
      array[i * 3] += Math.cos(angle) * 0.02;
      array[i * 3 + 1] += 0.02;
      array[i * 3 + 2] += Math.sin(angle) * 0.02;
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.particles.geometry.dispose();
    (this.particles.material as THREE.PointsMaterial).dispose();
    this.particles.parent?.remove(this.particles);
  }
}

class ConfettiEmitter implements Emitter {
  life = 2;
  private readonly particles: THREE.Points;
  private readonly velocities: Float32Array;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    const count = 30;
    const positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 1] = position.y + Math.random() * 0.3;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.5;

      this.velocities[i * 3] = (Math.random() - 0.5) * 3;
      this.velocities[i * 3 + 1] = Math.random() * 3 + 1;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 3;

      const hue = Math.random();
      colors[i * 3] = hue > 0.5 ? 1 : 0.9;
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.5;
      colors[i * 3 + 2] = Math.random() > 0.5 ? 1 : 0.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.05,
      transparent: true,
      opacity: 1,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geo, mat);
    scene.add(this.particles);
  }

  update(delta: number): void {
    this.life -= delta;
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const array = pos.array as Float32Array;

    for (let i = 0; i < array.length / 3; i++) {
      this.velocities[i * 3 + 1] -= 4 * delta; // gravity
      array[i * 3] += this.velocities[i * 3] * delta;
      array[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;
      array[i * 3 + 2] += this.velocities[i * 3 + 2] * delta;
    }
    pos.needsUpdate = true;

    const fade = Math.min(this.life / 0.5, 1);
    (this.particles.material as THREE.PointsMaterial).opacity = fade;
  }

  dispose(): void {
    this.particles.geometry.dispose();
    (this.particles.material as THREE.PointsMaterial).dispose();
    this.particles.parent?.remove(this.particles);
  }
}
