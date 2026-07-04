import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

import fbxUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_model_Animation_Walking_withSkin.fbx?url';
import texBaseUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_texture_0.png?url';
import texRoughnessUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_texture_0_roughness.png?url';
import texMetallicUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_texture_0_metallic.png?url';

let template: THREE.Group | null = null;
let templateClips: THREE.AnimationClip[] = [];

const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();

export interface LoadProgress { fraction: number; }
type ProgressCb = (p: LoadProgress) => void;
const progressListeners: ProgressCb[] = [];

export function onLoadProgress(cb: ProgressCb): () => void {
  progressListeners.push(cb);
  return () => { const i = progressListeners.indexOf(cb); if (i >= 0) progressListeners.splice(i, 1); };
}

function notify(fraction: number): void {
  for (const cb of progressListeners) cb({ fraction });
}

export function getAnimationClips(): THREE.AnimationClip[] {
  return templateClips;
}

export async function loadDeerTemplate(): Promise<void> {
  if (template) return;

  notify(0);

  const [baseMap, roughMap, metalMap] = await Promise.all([
    texLoader.loadAsync(texBaseUrl),
    texLoader.loadAsync(texRoughnessUrl),
    texLoader.loadAsync(texMetallicUrl),
  ]);
  notify(0.3);

  const fbxGroup = await fbxLoader.loadAsync(fbxUrl);
  notify(0.8);

  fbxGroup.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.material = new THREE.MeshStandardMaterial({
        map: baseMap,
        roughnessMap: roughMap,
        metalnessMap: metalMap,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });

  template = fbxGroup;
  templateClips = fbxGroup.animations ?? [];

  console.log(`[DeerModel] loaded ${templateClips.length} clips`);
  notify(1);
}

export function isDeerTemplateLoaded(): boolean {
  return template !== null;
}

export function cloneDeerTemplate(scale: number): THREE.Group {
  if (!template) throw new Error('Deer template not loaded.');

  const clone = SkeletonUtils.clone(template) as THREE.Group;

  const meshes: THREE.SkinnedMesh[] = [];
  clone.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.SkinnedMesh) meshes.push(child);
  });

  for (const m of meshes) {
    m.geometry = m.geometry.clone();
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * scale, pos.getY(i) * scale, pos.getZ(i) * scale);
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
    m.frustumCulled = false;
  }

  clone.updateWorldMatrix(true, true);
  for (const m of meshes) m.bind(m.skeleton, m.bindMatrix);

  return clone;
}
