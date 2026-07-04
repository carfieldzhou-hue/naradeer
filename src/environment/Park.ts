import * as THREE from 'three';
import { Tree } from './Tree';
import { ToriiGate, StoneLantern, Temple, Bamboo, TempleBell, KoiFish, ViewingPlatform } from './Props';

export interface ParkBounds {
  halfWidth: number;
  halfDepth: number;
}

const SPREAD = 3.5; // Scale factor for zone positions relative to original 24x18 map

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
    this.groundTexture.repeat.set(40, 40);
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

    // ---- Zones (scaled by SPREAD) ----
    this._buildMainPlaza(bounds);
    this._buildPondGarden(bounds);
    this._buildShrineCorner(bounds);
    this._buildBambooGrove(bounds);
    this._buildHillViewpoint(bounds);
    this._buildCherryAvenue(bounds);

    // ---- Scattered decorations across full map ----
    this._placeScatteredTrees(bounds);
    this._placeFlowers(bounds);
    this._placeBushes(bounds);
    this._placeExtraLanterns(bounds);
  }

  private zx(x: number, z: number): { x: number; z: number } {
    return { x: x * SPREAD, z: z * SPREAD };
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

    // Path to pond
    const pond = this.zx(-4, 12);
    const pondPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 12),
      pathMat,
    );
    pondPath.rotation.x = -Math.PI / 2;
    pondPath.position.set(pond.x, 0.01, pond.z);
    pondPath.receiveShadow = true;
    this.group.add(pondPath);

    // Path to shrine
    const shrine = this.zx(14, 4);
    const shrinePath = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 1.0),
      pathMat,
    );
    shrinePath.rotation.x = -Math.PI / 2;
    shrinePath.position.set(shrine.x, 0.01, shrine.z);
    shrinePath.receiveShadow = true;
    this.group.add(shrinePath);

    // Path to bamboo grove
    const bamboo = this.zx(-14, -7);
    const bambooPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 16),
      pathMat,
    );
    bambooPath.rotation.x = -Math.PI / 2;
    bambooPath.position.set(bamboo.x, 0.01, bamboo.z);
    bambooPath.receiveShadow = true;
    this.group.add(bambooPath);

    // Path to hill viewpoint
    const hill = this.zx(-17, 2);
    const hillPath = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 1.0),
      pathMat,
    );
    hillPath.rotation.x = -Math.PI / 2;
    hillPath.position.set(hill.x, 0.01, hill.z);
    hillPath.receiveShadow = true;
    this.group.add(hillPath);

    // Cherry avenue path
    const cherry = this.zx(12, -12);
    const cherryPath = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 16),
      pathMat,
    );
    cherryPath.rotation.x = -Math.PI / 2;
    cherryPath.position.set(cherry.x, 0.01, cherry.z);
    cherryPath.receiveShadow = true;
    this.group.add(cherryPath);
  }

  private _buildMainPlaza(_bounds: ParkBounds): void {
    const c = this.zx(0, 0);

    // Surrounding cherry trees
    const positions = [
      { x: -6, z: -5 }, { x: -4, z: -7 }, { x: 0, z: -6 },
      { x: 3, z: -7 }, { x: 7, z: -5 }, { x: 9, z: -3 },
      { x: 6, z: 4 }, { x: -3, z: 5 }, { x: 4, z: 6 },
      { x: -7, z: 3 }, { x: -8, z: -2 }, { x: 2, z: -3 },
      { x: -5, z: 0 },
    ];
    for (const p of positions) {
      const pos = this.zx(p.x, p.z);
      const tree = new Tree({
        position: new THREE.Vector3(pos.x, 0, pos.z),
        scale: 1.0 + Math.random() * 0.3,
        canopySize: 0.9 + Math.random() * 0.4,
        trunkHeight: 0.7 + Math.random() * 0.5,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    // Torii gates
    const torii1 = new ToriiGate(new THREE.Vector3(0, 0, -_bounds.halfDepth + 4), 1.8);
    this.toriiGates.push(torii1);
    this.group.add(torii1.group);

    const torii2Pos = this.zx(6, -6);
    const torii2 = new ToriiGate(new THREE.Vector3(torii2Pos.x, 0, torii2Pos.z), 1.2);
    this.toriiGates.push(torii2);
    this.group.add(torii2.group);

    // Stone lanterns
    const lanternPos = [{ x: -4, z: -4 }, { x: 5, z: -3 }, { x: -2, z: 4 }, { x: 7, z: 2 }, { x: -7, z: -2 }, { x: 3, z: -1 }];
    for (const p of lanternPos) {
      const pos = this.zx(p.x, p.z);
      const lantern = new StoneLantern(new THREE.Vector3(pos.x, 0, pos.z), 0.8 + Math.random() * 0.3);
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }
  }

  private _buildPondGarden(_bounds: ParkBounds): void {
    const c = this.zx(-4, 10);

    // Large pond
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#4fc3f7', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.7,
    });
    const pond = new THREE.Mesh(new THREE.CircleGeometry(6, 24), waterMat);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(c.x, 0.02, c.z);
    this.waterMeshes.push(pond);
    this.group.add(pond);

    // Small adjacent pond
    const sp = this.zx(2, 13);
    const smallPond = new THREE.Mesh(new THREE.CircleGeometry(2.5, 16), waterMat);
    smallPond.rotation.x = -Math.PI / 2;
    smallPond.position.set(sp.x, 0.02, sp.z);
    this.waterMeshes.push(smallPond);
    this.group.add(smallPond);

    // Lotus leaves
    const lotusMat = new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
    for (let i = 0; i < 20; i++) {
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.08 + Math.random() * 0.06, 6), lotusMat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.5 + Math.random() * 5;
      leaf.position.set(c.x + Math.cos(angle) * dist, 0.03, c.z + Math.sin(angle) * dist);
      this.group.add(leaf);
    }

    // Koi fish
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 3;
      const koi = new KoiFish(new THREE.Vector3(c.x + Math.cos(angle) * dist, 0.05, c.z + Math.sin(angle) * dist), 0.6 + Math.random() * 0.8);
      this.koiFish.push(koi);
      this.group.add(koi.group);
    }

    // Trees around pond
    const treePos = [{ x: -7, z: 8 }, { x: -1, z: 8 }, { x: -8, z: 12 }, { x: 0, z: 15 }, { x: -6, z: 14 }];
    for (const p of treePos) {
      const pos = this.zx(p.x, p.z);
      const tree = new Tree({ position: new THREE.Vector3(pos.x, 0, pos.z), scale: 0.9 + Math.random() * 0.3, canopySize: 0.9 + Math.random() * 0.4, trunkHeight: 0.7 + Math.random() * 0.5 });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    // Stone lanterns near pond
    for (let i = 0; i < 3; i++) {
      const pos = this.zx(-6 + i * 4, 14);
      const lantern = new StoneLantern(new THREE.Vector3(pos.x, 0, pos.z), 0.7 + Math.random() * 0.2);
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }
  }

  private _buildShrineCorner(_bounds: ParkBounds): void {
    const c = this.zx(16, 2);

    const temple = new Temple(new THREE.Vector3(c.x, 0, c.z), 2.2);
    this.temples.push(temple);
    this.group.add(temple.group);

    const bellPos = this.zx(14, 5);
    const bell = new TempleBell(new THREE.Vector3(bellPos.x, 0, bellPos.z), 1.4);
    this.bells.push(bell);
    this.group.add(bell.group);

    const toriiPos = this.zx(11, 4);
    const torii = new ToriiGate(new THREE.Vector3(toriiPos.x, 0, toriiPos.z), 1.5);
    this.toriiGates.push(torii);
    this.group.add(torii.group);

    for (let i = 0; i < 4; i++) {
      const pos = this.zx(11 + i * 2, 2.5);
      const lantern = new StoneLantern(new THREE.Vector3(pos.x, 0, pos.z), 1.0);
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }

    const treePos = [{ x: 12, z: -2 }, { x: 18, z: -1 }, { x: 20, z: 4 }, { x: 14, z: 8 }, { x: 19, z: 7 }, { x: 9, z: 6 }];
    for (const p of treePos) {
      const pos = this.zx(p.x, p.z);
      const tree = new Tree({ position: new THREE.Vector3(pos.x, 0, pos.z), scale: 0.9 + Math.random() * 0.3, canopySize: 0.9 + Math.random() * 0.4, trunkHeight: 0.7 + Math.random() * 0.5 });
      this.trees.push(tree);
      this.group.add(tree.group);
    }
  }

  private _buildBambooGrove(_bounds: ParkBounds): void {
    const c = this.zx(-16, -12);

    for (let i = 0; i < 50; i++) {
      const x = c.x + (Math.random() - 0.5) * 40;
      const z = c.z + (Math.random() - 0.5) * 25;
      const bamboo = new Bamboo(new THREE.Vector3(x, 0, z), 1.2 + Math.random() * 2.0);
      this.bamboos.push(bamboo);
      this.group.add(bamboo.group);
    }

    // Stone lanterns
    for (let i = 0; i < 4; i++) {
      const pos = this.zx(-16 + i * 3, -9 + i * 2);
      const lantern = new StoneLantern(new THREE.Vector3(pos.x, 0, pos.z), 0.9);
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }

    // Trees at edge
    for (let i = 0; i < 5; i++) {
      const pos = this.zx(-8 + Math.random() * 4, -12 + Math.random() * 4);
      const tree = new Tree({ position: new THREE.Vector3(pos.x, 0, pos.z), scale: 0.8 + Math.random() * 0.4, canopySize: 0.8 + Math.random() * 0.5, trunkHeight: 0.7 + Math.random() * 0.4 });
      this.trees.push(tree);
      this.group.add(tree.group);
    }
  }

  private _buildHillViewpoint(_bounds: ParkBounds): void {
    const c = this.zx(-18, 0);

    const platform1 = new ViewingPlatform(new THREE.Vector3(c.x, 0, c.z), 1.5);
    this.viewingPlatforms.push(platform1);
    this.group.add(platform1.group);

    const p2 = this.zx(-20, -3);
    const platform2 = new ViewingPlatform(new THREE.Vector3(p2.x, 0, p2.z), 1.0);
    this.viewingPlatforms.push(platform2);
    this.group.add(platform2.group);

    const treePos = [{ x: -21, z: -2 }, { x: -15, z: -3 }, { x: -22, z: 3 }, { x: -14, z: 4 }, { x: -16, z: -5 }, { x: -20, z: 5 }, { x: -12, z: -1 }];
    for (const p of treePos) {
      const pos = this.zx(p.x, p.z);
      const tree = new Tree({ position: new THREE.Vector3(pos.x, 0, pos.z), scale: 0.9 + Math.random() * 0.3, canopySize: 0.9 + Math.random() * 0.4, trunkHeight: 0.7 + Math.random() * 0.5 });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    const lPos = this.zx(-17, 1);
    const lantern = new StoneLantern(new THREE.Vector3(lPos.x, 0, lPos.z), 1.2);
    this.lanterns.push(lantern);
    this.group.add(lantern.group);
  }

  private _buildCherryAvenue(_bounds: ParkBounds): void {
    const c = this.zx(12, -12);

    for (let i = -4; i <= 4; i++) {
      for (let side = -1; side <= 1; side += 2) {
        const tree = new Tree({
          position: new THREE.Vector3(c.x + side * 3.5, 0, c.z + i * 3),
          scale: 0.9 + Math.random() * 0.4,
          canopySize: 1.0 + Math.random() * 0.4,
          trunkHeight: 0.8 + Math.random() * 0.4,
        });
        this.trees.push(tree);
        this.group.add(tree.group);
      }
    }

    for (let i = 0; i < 6; i++) {
      const tree = new Tree({
        position: new THREE.Vector3(c.x + (Math.random() - 0.5) * 12, 0, c.z - 6 + Math.random() * 12),
        scale: 0.8 + Math.random() * 0.5,
        canopySize: 0.8 + Math.random() * 0.5,
        trunkHeight: 0.7 + Math.random() * 0.5,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }

    for (let i = 0; i < 5; i++) {
      const pos = this.zx(14 + i * 2, -10 + i * 3);
      const lantern = new StoneLantern(new THREE.Vector3(pos.x, 0, pos.z), 0.7 + Math.random() * 0.3);
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }
  }

  private _placeScatteredTrees(bounds: ParkBounds): void {
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.8;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.8;
      // Keep central paths clear
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
      const tree = new Tree({
        position: new THREE.Vector3(x, 0, z),
        scale: 0.7 + Math.random() * 0.5,
        canopySize: 0.7 + Math.random() * 0.5,
        trunkHeight: 0.6 + Math.random() * 0.5,
      });
      this.trees.push(tree);
      this.group.add(tree.group);
    }
  }

  private _placeFlowers(bounds: ParkBounds): void {
    const colors = ['#e91e63', '#f44336', '#ff5722', '#9c27b0', '#ff80ab', '#ffab40', '#e040fb'];

    for (let i = 0; i < 200; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
      const petalGeo = new THREE.CircleGeometry(0.03 + Math.random() * 0.025, 5);
      const flower = new THREE.Mesh(petalGeo, mat);
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.8;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.8;
      if (Math.abs(x) < 1 && Math.abs(z) < 1) continue;
      flower.position.set(x, 0.02, z);
      flower.rotation.x = -Math.PI / 2;
      flower.rotation.z = Math.random() * Math.PI;
      this.flowerMeshes.push(flower);
      this.group.add(flower);
    }
  }

  private _placeBushes(bounds: ParkBounds): void {
    const bushMat = new THREE.MeshStandardMaterial({ color: '#558b2f', roughness: 0.9, metalness: 0, flatShading: true });

    for (let i = 0; i < 100; i++) {
      const bushGeo = new THREE.SphereGeometry(0.15 + Math.random() * 0.2, 5, 4);
      const pos = bushGeo.attributes.position;
      for (let j = 0; j < pos.count; j++) pos.setY(j, pos.getY(j) * 0.5);
      pos.needsUpdate = true;
      bushGeo.computeVertexNormals();

      const bush = new THREE.Mesh(bushGeo, bushMat);
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.8;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.8;
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
      bush.position.set(x, 0.05, z);
      bush.castShadow = true;
      bush.receiveShadow = true;
      this.group.add(bush);
    }
  }

  private _placeExtraLanterns(bounds: ParkBounds): void {
    for (let i = 0; i < 10; i++) {
      const x = (Math.random() - 0.5) * bounds.halfWidth * 1.4;
      const z = (Math.random() - 0.5) * bounds.halfDepth * 1.4;
      const lantern = new StoneLantern(new THREE.Vector3(x, 0, z), 0.6 + Math.random() * 0.4);
      this.lanterns.push(lantern);
      this.group.add(lantern.group);
    }
  }

  update(delta: number): void {
    this.waterTime += delta;
    const wave = Math.sin(this.waterTime * 0.5);
    for (const water of this.waterMeshes) {
      water.position.y = 0.02 + wave * 0.005;
    }

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
