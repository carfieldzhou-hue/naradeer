import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

import glbUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_model_Animation_Walking_withSkin.glb?url';
import texBaseUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_texture_0.webp?url';
import texRoughnessUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_texture_0_roughness.webp?url';
import texMetallicUrl from '../../asset/Meshy_quadruped/Meshy_AI_Whispering_Fawn_quadruped_texture_0_metallic.webp?url';

import { loadGltfWithProgress, loadTextureWithProgress, type AssetProgress } from '../utils/assets';

let template: THREE.Group | null = null;
let templateClips: THREE.AnimationClip[] = [];

const gltfLoader = new GLTFLoader();
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

// Total weight of the 4 sub-assets: 3 textures (small) + 1 GLB (big).
// Textures share 30% of the bar, GLB 70% — that matches where the bytes are.
const TEXTURES_TOTAL_WEIGHT = 0.30;
const GLB_WEIGHT = 0.70;

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

/** Convert a single sub-asset's bytes-progress into the global fraction
 *  (0..1) considering only that sub-asset's share of the whole bar. */
function subProgress(p: AssetProgress, subTotalWeight: number): number {
  if (p.total <= 0) return 0;
  return clamp01(p.loaded / p.total) * subTotalWeight;
}

export async function loadDeerTemplate(): Promise<void> {
  if (template) return;

  notify(0);

  // ---- Textures (each contributes ~10% of the bar) ----
  const texBaseProg = (p: AssetProgress) =>
    notify(subProgress(p, TEXTURES_TOTAL_WEIGHT / 3));
  const texRoughProg = (p: AssetProgress) =>
    notify(subProgress(p, TEXTURES_TOTAL_WEIGHT / 3) + TEXTURES_TOTAL_WEIGHT / 3);
  const texMetalProg = (p: AssetProgress) =>
    notify(subProgress(p, TEXTURES_TOTAL_WEIGHT / 3) + (TEXTURES_TOTAL_WEIGHT / 3) * 2);

  const [baseMap, roughMap, metalMap] = await Promise.all([
    loadTextureWithProgress(texBaseUrl, texLoader, texBaseProg),
    loadTextureWithProgress(texRoughnessUrl, texLoader, texRoughProg),
    loadTextureWithProgress(texMetallicUrl, texLoader, texMetalProg),
  ]);
  notify(TEXTURES_TOTAL_WEIGHT);

  // ---- GLB (the big one: ~70% of the bar) ----
  // Was FBX before 2026-07-10; switched to GLB because GLB parses in <100 ms
  // vs FBX's 2-5 s, eliminating the main-thread freeze on click.
  const glbProg = (p: AssetProgress) =>
    notify(TEXTURES_TOTAL_WEIGHT + subProgress(p, GLB_WEIGHT));
  const gltf = await loadGltfWithProgress(glbUrl, gltfLoader, glbProg);
  const glbGroup = gltf.scene as THREE.Group;

  glbGroup.traverse((child: THREE.Object3D) => {
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

  // ---- Auto-normalize unit (fbx2gltf conversion bug) ----
  // The deer GLB exported via fbx2gltf comes in at 0.017m tall (1.7cm) — the
  // conversion tool left the original FBX cm/metadata unhandled and shrank
  // vertices ~100x. VendorModel's GLB is fine (1.83m), so the issue is
  // specific to the deer FBX. Detect by checking the GLB's root bbox: a real
  // fawn is at least 0.5m at the hip — anything under that is a unit bug.
  //
  // Apply the fix to glbGroup's FIRST CHILD (the GLB's internal root, e.g.
  // "RootNode") rather than glbGroup itself. Reason: glbGroup becomes the
  // template, and Deer.ts calls `modelRoot.scale.setScalar(scaleFactor)` for
  // per-rarity size. If we scale glbGroup itself, that later setScalar()
  // overwrites our fix. Scaling the inner root nests the transform: the
  // eventual world size is (rarity scaleFactor) × (fixScale) × (vertex size).
  const TARGET_DEER_HEIGHT = 1.2; // cartoony "deer at player's hip" height — readable from camera
  const UNIT_BUG_THRESHOLD = 0.5; // anything shorter than this is clearly broken
  const probeBox = new THREE.Box3().setFromObject(glbGroup);
  const probeHeight = probeBox.max.y - probeBox.min.y;
  if (probeHeight > 0 && probeHeight < UNIT_BUG_THRESHOLD) {
    const fixScale = TARGET_DEER_HEIGHT / probeHeight;
    // Walk one level down. Use a dedicated Object3D wrapper so we never
    // mutate a child we don't own (RootNode is an Object3D, not a Group).
    const innerRoot = glbGroup.children[0];
    if (innerRoot) {
      innerRoot.scale.setScalar(fixScale);
      // Make sure the new transform lands before Deer.ts builds the template
      // (modelRoot = clone(template) reads from inner RootNode's world).
      glbGroup.updateMatrixWorld(true);
      console.warn(
        `[DeerModel] fbx2gltf unit bug detected: GLB height=${probeHeight.toFixed(3)}m. ` +
        `Auto-normalized inner root with scale=${fixScale.toFixed(1)}x to ~${TARGET_DEER_HEIGHT}m.`,
      );
    }
  }

  template = glbGroup;
  templateClips = gltf.animations ?? [];

  console.log(`[DeerModel] loaded ${templateClips.length} clips`);
  notify(1);
}

export function isDeerTemplateLoaded(): boolean {
  return template !== null;
}

export function cloneDeerTemplate(): THREE.Group {
  if (!template) throw new Error('Deer template not loaded.');

  const clone = SkeletonUtils.clone(template) as THREE.Group;

  // SkinnedMesh bind is preserved by SkeletonUtils.clone — bones + bindMatrix
  // + skin indices all travel with the clone. We deliberately do NOT bake a
  // per-vertex scale here: that would invalidate the bind matrix and produce
  // the 'tiny deer with weird walk' bug. Apply rarity size via
  // `modelRoot.scale.setScalar(scaleFactor)` at the call site instead.

  clone.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.SkinnedMesh) child.frustumCulled = false;
  });

  return clone;
}

export function getAnimationClips(): THREE.AnimationClip[] {
  return templateClips;
}