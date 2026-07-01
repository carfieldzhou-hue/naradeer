import * as THREE from 'three';
import { Tree } from './Tree';
import { ToriiGate, StoneLantern, Temple, Bamboo, TempleBell, KoiFish, ViewingPlatform } from './Props';

export interface ParkBounds {
  halfWidth: number;
  halfDepth: number;
}

export class Park {
  readonly group = new THREE.Group();
  readonly trees: Tree[] = [];
  readonly lanterns: StoneLantern[] = [];
  readonly toriiGates: ToriiGate[] = [];
  readonly temples: Temple[] = [];
  readonly bamboos: Bamboo[] = [];
  readonly bells: TempleBell[] = [];
  readonly koiFish: KoiFish[] = [];
  readonly viewingPlatforms: ViewingPlatform[] = [];
  private readonly groundMesh: THREE.Mesh;
  private readonly groundTexture: THREE.CanvasTexture;
  private readonly waterMeshes: THREE.Mesh[] = [];
  private waterTime = 0;
  private readonly flowerMeshes: THREE.Mesh[] = [];

  constructor(_scene: THREE.Scene, bounds: ParkBounds) {
    // ---- Ground ----
    this.groundTexture = this._groundTexture();
    this.groundTexture.wrapS = THREE.RepeatWrapping;
    this.groundTexture.wrapT = THREE.RepeatWrapping;
    this.groundTexture.repeat.set(12, 12);
    this.groundTexture.anisotropy = 4;

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

    // ---- Path network ----
    this._createPaths(bounds);

    // ---- Main Plaza (center) ----
    this._buildMainPlaza(bounds);

    // ---- Pond Garden (south) ----
    this._buildPondGarden(bounds);

    // ---- Shrine Corner (east) ----
    this._buildShrineCorner(bounds);

    // ---- Bamboo Grove (northwest) ----
    this._buildBambooGrove(bounds);

    // ---- Hill Viewpoint (west) ----
    this._buildHillViewpoint(bounds);

    // ---- Cherry Blossom Avenue (northeast) ----
    this._buildCherryAvenue(bounds);

    // ---- Scattered decorations ----
    this._placeFlowers(bounds);
    this._placeBushes(bounds);
  }

  private _groundTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#7cb342';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const shade = Math.random() * 30 - 15;
      const g = 179 + shade;
      ctx.fillStyle = `rgb(${Math.floor(124 + shade * 0.5)}, ${Math.min(255, Math.max(0, g))}, ${Math.floor(66 + shade * 0.3)})`;
      ctx.fillRect(x, y, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private _createPaths(bounds: ParkBounds): void {
    const pathMat = new THREE.MeshStandardMaterial({
      color: '#a1887f',
      roughness: 0.9,
      metalness: 0,
    });

    // Main north-south path
    const mainPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, bounds.halfDepth * 2),
      pathMat,
    );
    mainPath.rotation.x = -Math.PI / 2;
    mainPath.position.y = 0.01;
    mainPath.receiveShadow = true;
    this.group.add(mainPath);

    // Main east-west path
    const crossPath = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.halfWidth * 2, 1.4),
      pathMat,
    );
    crossPath.rotation.x = -Math.PI / 2;
    crossPath.position.y = 0.01;
    crossPath.receiveShadow = true;
    this.group.add(crossPath);

    // Path to pond (south from center)
    const pondPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 6),
      pathMat,
    );
    pondPath.rotation.x = -Math.PI / 2;
    pondPath.position.set(-4, 0.01, 12);
    pondPath.receiveShadow = true;
    this.group.add(pondPath);

    // Path to shrine (east from center)
    const shrinePath = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 1.0),
      pathMat,
    );
    shrinePath.rotation.x = -Math.PI / 2;
    shrinePath.position.set(14, 0.01, 4);
    shrinePath.receiveShadow = true;
    this.group.add(shrinePath);

    // Path to bamboo grove
    const bambooPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 8),
      pathMat,
    );
    bambooPath.rotation.x = -Math.PI / 2;
    bambooPath.position.set(-14, 0.01, -7);
    bambooPath.receiveShadow = true;
    this.group.add(bambooPath);

    // Path to hill viewpoint
    const hillPath = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.0),
      pathMat,
    );
    hillPath.rotation.x = -Math.PI / 2;
    hillPath.position.set(-17, 0.01, 2);
    hillPath.receiveShadow = true;
    this.group.add(hillPath);

    // Cherry avenue path
    const cherryPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 8),
      pathMat,
    );
    cherryPath.rotation.x = -Math.PI / 2;
    cherryPath.position.set(12, 0.01, -12);
    cherryPath.receiveShadow = true;
    this.group.add(cherryPath);
  }

  private _buildMainPlaza(_bounds: ParkBounds): void {
    // Surrounding cherry trees
    const plazaTreePositions = [
      { x: -6, z: -5, s: 1.1 },
      { x: -4, z: -7, s: 0.9 },
      { x: 0, z: -6, s: 1.2 },
      { x: 3, z: -7, s: 0.8 },
      { x: 7, z: -5, s: 1.0 },
      { x: 9, z: -3, s: 1.1 },
      { x: 6, z: 4, s: 0.9 },
      { x: -3, z: 5, s: 1.0 },
      { x: 4, z: 6, s: 1.2 },
      { x: -7, z: 3, s: 0.9 },
      { x: -8, z: -2, s: 1.0 },
      { x: 2, z: -3, s: 0.8 },
      { x: -5, z: 0, s: 1.1 },
    ];
    for (const p of plazaTreePositions) {
      const tree = new Tree({
        position: new THREE.Vector3(p.x, 0, p.z),
        scale: p.s,
        canopySize: 1.0 + Math.random() * 0.3,
        trunkHeight: 0.8 + Math.random() * 0.4,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    // Torii gates at main entrance
    const torii1 = new ToriiGate(new THREE.Vector3(0, 0, -_bounds.halfDepth + 2), 1.4);
    this.toriiGates.push(torii1);
    this.group.add(torii1.group);

    const torii2 = new ToriiGate(new THREE.Vector3(6, 0, -6), 0.9);
    this.toriiGates.push(torii2);
    this.group.add(torii2.group);

    // Stone lanterns around plaza
    const plazaLanternPositions = [
      { x: -4, z: -4 },
      { x: 5, z: -3 },
      { x: -2, z: 4 },
      { x: 7, z: 2 },
      { x: -7, z: -2 },
      { x: 3, z: -1 },
    ];
    for (const pos of plazaLanternPositions) {
      const lantern = new StoneLantern(
        new THREE.Vector3(pos.x, 0, pos.z),
        0.8 + Math.random() * 0.3,
      );
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }

    // Benches (simple boxes)
    const benchMat = new THREE.MeshStandardMaterial({
      color: '#6d4c41',
      roughness: 0.85,
    });
    const benchPositions = [
      { x: -5, z: 2, rot: 0.3 },
      { x: 5, z: -1, rot: -0.2 },
    ];
    for (const b of benchPositions) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.25), benchMat);
      bench.position.set(b.x, 0.05, b.z);
      bench.rotation.y = b.rot;
      bench.receiveShadow = true;
      this.group.add(bench);
    }
  }

  private _buildPondGarden(_bounds: ParkBounds): void {
    // Large pond
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#4fc3f7',
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.7,
    });
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(4, 24),
      waterMat,
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-4, 0.02, 10);
    this.waterMeshes.push(pond);
    this.group.add(pond);

    // Small adjacent pond
    const smallPond = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 16),
      waterMat,
    );
    smallPond.rotation.x = -Math.PI / 2;
    smallPond.position.set(2, 0.02, 13);
    this.waterMeshes.push(smallPond);
    this.group.add(smallPond);

    // Lotus leaves
    const lotusMat = new THREE.MeshStandardMaterial({
      color: '#2e7d32',
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 12; i++) {
      const leaf = new THREE.Mesh(
        new THREE.CircleGeometry(0.08 + Math.random() * 0.06, 6),
        lotusMat,
      );
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.3 + Math.random() * 3;
      leaf.position.set(-4 + Math.cos(angle) * dist, 0.03, 10 + Math.sin(angle) * dist);
      this.group.add(leaf);
    }

    // Koi fish
    const koiPositions = [
      { x: -4, z: 10 },
      { x: -3, z: 11 },
      { x: -5, z: 9 },
      { x: -2, z: 10 },
    ];
    for (const pos of koiPositions) {
      const koi = new KoiFish(
        new THREE.Vector3(pos.x, 0.05, pos.z),
        0.6 + Math.random() * 0.8,
      );
      this.koiFish.push(koi);
      this.group.add(koi.group);
    }

    // Cherry trees around pond
    const pondTreePositions = [
      { x: -7, z: 8, s: 1.1 },
      { x: -1, z: 8, s: 0.9 },
      { x: -8, z: 12, s: 1.0 },
      { x: 0, z: 15, s: 0.8 },
      { x: -6, z: 14, s: 1.2 },
    ];
    for (const p of pondTreePositions) {
      const tree = new Tree({
        position: new THREE.Vector3(p.x, 0, p.z),
        scale: p.s,
        canopySize: 1.0 + Math.random() * 0.3,
        trunkHeight: 0.8 + Math.random() * 0.4,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    // Stone lanterns near pond
    for (let i = 0; i < 2; i++) {
      const lantern = new StoneLantern(
        new THREE.Vector3(-6 + i * 4, 0, 14),
        0.7 + Math.random() * 0.2,
      );
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }
  }

  private _buildShrineCorner(_bounds: ParkBounds): void {
    // Temple building
    const temple = new Temple(new THREE.Vector3(16, 0, 2), 1.8);
    this.temples.push(temple);
    this.group.add(temple.group);

    // Temple bell
    const bell = new TempleBell(new THREE.Vector3(14, 0, 5), 1.0);
    this.bells.push(bell);
    this.group.add(bell.group);

    // Torii gate at shrine entrance
    const torii = new ToriiGate(new THREE.Vector3(11, 0, 4), 1.1);
    this.toriiGates.push(torii);
    this.group.add(torii.group);

    // Stone lanterns along shrine path
    for (let i = 0; i < 3; i++) {
      const lantern = new StoneLantern(
        new THREE.Vector3(11 + i * 2, 0, 2.5),
        0.8,
      );
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }

    // Trees around shrine
    const shrineTreePositions = [
      { x: 12, z: -2, s: 1.2 },
      { x: 18, z: -1, s: 1.0 },
      { x: 20, z: 4, s: 0.9 },
      { x: 14, z: 8, s: 1.1 },
      { x: 19, z: 7, s: 0.8 },
      { x: 9, z: 6, s: 1.0 },
    ];
    for (const p of shrineTreePositions) {
      const tree = new Tree({
        position: new THREE.Vector3(p.x, 0, p.z),
        scale: p.s,
        canopySize: 1.0 + Math.random() * 0.3,
        trunkHeight: 0.8 + Math.random() * 0.4,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }
  }

  private _buildBambooGrove(_bounds: ParkBounds): void {
    // Bamboo stalks lining the path
    for (let i = 0; i < 30; i++) {
      const x = -16 + (Math.random() - 0.5) * 14;
      const z = -12 + (Math.random() - 0.5) * 8;
      // Avoid blocking the path center
      if (Math.abs(x + 14) < 2 && Math.abs(z + 7) < 2) continue;
      const bamboo = new Bamboo(
        new THREE.Vector3(x, 0, z),
        1.2 + Math.random() * 1.5,
      );
      this.bamboos.push(bamboo);
      this.group.add(bamboo.group);
    }

    // Dense bamboo along edges
    for (let i = 0; i < 15; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const bamboo = new Bamboo(
        new THREE.Vector3(-20 + (Math.random() - 0.5) * 6, 0, -12 + side * (1.5 + Math.random() * 3)),
        1.5 + Math.random() * 1.0,
      );
      this.bamboos.push(bamboo);
      this.group.add(bamboo.group);
    }

    // Stone lanterns in bamboo grove
    for (let i = 0; i < 2; i++) {
      const lantern = new StoneLantern(
        new THREE.Vector3(-16 + i * 3, 0, -9 + i * 2),
        0.7,
      );
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }

    // Few cherry trees at bamboo edge
    for (let i = 0; i < 3; i++) {
      const tree = new Tree({
        position: new THREE.Vector3(-8 + Math.random() * 4, 0, -12 + Math.random() * 4),
        scale: 0.8 + Math.random() * 0.3,
        canopySize: 0.8 + Math.random() * 0.4,
        trunkHeight: 0.7 + Math.random() * 0.3,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }
  }

  private _buildHillViewpoint(_bounds: ParkBounds): void {
    // Raised hill - using a subtle ground raise isn't easy without mesh deformation,
    // so we use a viewing platform to mark the spot
    const platform1 = new ViewingPlatform(
      new THREE.Vector3(-18, 0, 0),
      1.2,
    );
    this.viewingPlatforms.push(platform1);
    this.group.add(platform1.group);

    // Small resting platform
    const platform2 = new ViewingPlatform(
      new THREE.Vector3(-20, 0, -3),
      0.7,
    );
    this.viewingPlatforms.push(platform2);
    this.group.add(platform2.group);

    // Trees around viewpoint
    const hillTreePositions = [
      { x: -21, z: -2, s: 1.0 },
      { x: -15, z: -3, s: 1.1 },
      { x: -22, z: 3, s: 0.9 },
      { x: -14, z: 4, s: 1.2 },
      { x: -16, z: -5, s: 0.8 },
      { x: -20, z: 5, s: 1.0 },
      { x: -12, z: -1, s: 1.0 },
    ];
    for (const p of hillTreePositions) {
      const tree = new Tree({
        position: new THREE.Vector3(p.x, 0, p.z),
        scale: p.s,
        canopySize: 1.0 + Math.random() * 0.3,
        trunkHeight: 0.8 + Math.random() * 0.4,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    // Stone lantern
    const lantern = new StoneLantern(
      new THREE.Vector3(-17, 0, 1),
      0.9,
    );
    this.lanterns.push(lantern);
    this.group.add(lantern.group);
  }

  private _buildCherryAvenue(_bounds: ParkBounds): void {
    // Cherry trees lining both sides of the avenue
    for (let i = -3; i <= 3; i++) {
      for (let side = -1; side <= 1; side += 2) {
        const tree = new Tree({
          position: new THREE.Vector3(12 + side * 2.5, 0, -6 + i * 2.5),
          scale: 0.9 + Math.random() * 0.3,
          canopySize: 1.1 + Math.random() * 0.3,
          trunkHeight: 0.9 + Math.random() * 0.3,
        });
        this.trees.push(tree);
        this.group.add(tree.group);
      }
    }

    // Extra trees at the end
    for (let i = 0; i < 4; i++) {
      const tree = new Tree({
        position: new THREE.Vector3(12 + (Math.random() - 0.5) * 6, 0, -15 + Math.random() * 4),
        scale: 0.8 + Math.random() * 0.4,
        canopySize: 0.9 + Math.random() * 0.4,
        trunkHeight: 0.7 + Math.random() * 0.4,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    // Stone lanterns along avenue
    for (let i = 0; i < 3; i++) {
      const lantern = new StoneLantern(
        new THREE.Vector3(14 + i * 2, 0, -10 + i * 3),
        0.7 + Math.random() * 0.2,
      );
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }
  }

  private _placeFlowers(bounds: ParkBounds): void {
    const colors = ['#e91e63', '#f44336', '#ff5722', '#9c27b0', '#ff80ab', '#ffab40', '#e040fb'];

    for (let i = 0; i < 80; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0,
        side: THREE.DoubleSide,
      });

      const petalGeo = new THREE.CircleGeometry(0.03 + Math.random() * 0.025, 5);
      const flower = new THREE.Mesh(petalGeo, mat);
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.8;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.8;
      // Keep flowers off paths
      if (Math.abs(x) < 1 && Math.abs(z) < 1) continue;
      if (Math.abs(x - (-4)) < 3 && Math.abs(z - 10) < 3) continue; // pond
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

    for (let i = 0; i < 40; i++) {
      const bushGeo = new THREE.SphereGeometry(
        0.15 + Math.random() * 0.2,
        5, 4,
      );
      const pos = bushGeo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.setY(j, pos.getY(j) * 0.5);
      }
      pos.needsUpdate = true;
      bushGeo.computeVertexNormals();

      const bush = new THREE.Mesh(bushGeo, bushMat);
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.8;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.8;
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
      if (Math.abs(x - (-4)) < 3 && Math.abs(z - 10) < 3.5) continue;
      bush.position.set(x, 0.05, z);
      bush.castShadow = true;
      bush.receiveShadow = true;
      this.group.add(bush);
    }
  }

  update(delta: number): void {
    this.waterTime += delta;
    const wave = Math.sin(this.waterTime * 0.5);
    for (const water of this.waterMeshes) {
      water.position.y = 0.02 + wave * 0.005;
    }

    // Koi fish swimming animation
    for (const koi of this.koiFish) {
      const phase = koi.swimPhase + this.waterTime * koi.swimSpeed;
      const baseX = koi.group.position.x;
      const baseZ = koi.group.position.z;
      koi.group.position.x = baseX + Math.cos(phase) * koi.swimRadius * 0.3;
      koi.group.position.z = baseZ + Math.sin(phase) * koi.swimRadius * 0.3;
      koi.group.rotation.y = Math.atan2(
        Math.sin(phase + 0.1) - Math.sin(phase),
        Math.cos(phase + 0.1) - Math.cos(phase),
      );
    }
  }

  dispose(): void {
    for (const tree of this.trees) tree.dispose();
    for (const lantern of this.lanterns) lantern.dispose();
    for (const torii of this.toriiGates) torii.dispose();
    for (const temple of this.temples) temple.dispose();
    for (const bamboo of this.bamboos) bamboo.dispose();
    for (const bell of this.bells) bell.dispose();
    for (const koi of this.koiFish) koi.dispose();
    for (const platform of this.viewingPlatforms) platform.dispose();
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
