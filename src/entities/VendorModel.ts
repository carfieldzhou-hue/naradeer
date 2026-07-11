import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

import glbUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture.glb?url';
import texUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture.webp?url';
import texRoughnessUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture_roughness.webp?url';
import texMetallicUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture_metallic.webp?url';

import { loadGltfWithProgress, loadTextureWithProgress, type AssetProgress } from '../utils/assets';

const TARGET_HEIGHT = 0.65;

let template: THREE.Group | null = null;
let scaleFactor = 1;
let texturesLoaded = false;
let baseMap: THREE.Texture | null = null;
let roughMap: THREE.Texture | null = null;
let metalMap: THREE.Texture | null = null;

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

// Vendor weight split — same shape as DeerModel (textures 30% / glb 70%).
const TEXTURES_TOTAL_WEIGHT = 0.30;
const GLB_WEIGHT = 0.70;
function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function subProgress(p: AssetProgress, subTotalWeight: number): number {
  if (p.total <= 0) return 0;
  return clamp01(p.loaded / p.total) * subTotalWeight;
}

export async function loadVendorTemplate(): Promise<void> {
  if (template) return;
  notify(0);

  // ---- Textures ----
  const texBaseProg = (p: AssetProgress) =>
    notify(subProgress(p, TEXTURES_TOTAL_WEIGHT / 3));
  const texRoughProg = (p: AssetProgress) =>
    notify(subProgress(p, TEXTURES_TOTAL_WEIGHT / 3) + TEXTURES_TOTAL_WEIGHT / 3);
  const texMetalProg = (p: AssetProgress) =>
    notify(subProgress(p, TEXTURES_TOTAL_WEIGHT / 3) + (TEXTURES_TOTAL_WEIGHT / 3) * 2);

  try {
    [baseMap, roughMap, metalMap] = await Promise.all([
      loadTextureWithProgress(texUrl, texLoader, texBaseProg),
      loadTextureWithProgress(texRoughnessUrl, texLoader, texRoughProg),
      loadTextureWithProgress(texMetallicUrl, texLoader, texMetalProg),
    ]);
    texturesLoaded = true;
    notify(TEXTURES_TOTAL_WEIGHT);
  } catch (err) {
    console.warn('[VendorModel] Textures failed to load, using solid color', err);
    notify(TEXTURES_TOTAL_WEIGHT);
  }

  // ---- GLB ----
  // Switched from FBX to GLB on 2026-07-10 to avoid the 2-5 s main-thread
  // freeze that FBXLoader.parse() inflicted on the click→start transition.
  // GLB is structured binary, parses in <100 ms, and embeds animation
  // channels directly. Texture URLs we already loaded above are still used
  // for material (color/roughness/metalness) — the GLB's default white
  // material is replaced here in the traverse loop.
  const gltfLoader = new GLTFLoader();
  const glbProg = (p: AssetProgress) =>
    notify(TEXTURES_TOTAL_WEIGHT + subProgress(p, GLB_WEIGHT));
  const gltf = await loadGltfWithProgress(glbUrl, gltfLoader, glbProg);
  const glbGroup = gltf.scene as THREE.Group;

  // Calculate proper scale
  const box = new THREE.Box3().setFromObject(glbGroup);
  const originalHeight = box.max.y - box.min.y;
  scaleFactor = TARGET_HEIGHT / originalHeight;
  console.log(`[VendorModel] original height: ${originalHeight.toFixed(3)}, scale: ${scaleFactor.toFixed(3)}`);

  glbGroup.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.material = new THREE.MeshStandardMaterial({
        map: baseMap,
        roughnessMap: roughMap,
        metalnessMap: metalMap,
        color: texturesLoaded ? '#ffffff' : '#8d6e63',
        roughness: 0.8,
        metalness: 0.1,
      });
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });

  template = glbGroup;
  notify(1);
  console.log(`[VendorModel] loaded template`);
}

export function isVendorTemplateLoaded(): boolean {
  return template !== null;
}

export function cloneVendorTemplate(): THREE.Group {
  if (!template) throw new Error('Vendor template not loaded.');

  const clone = SkeletonUtils.clone(template) as THREE.Group;

  clone.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.geometry = child.geometry.clone();
      child.frustumCulled = false;
      // Reassign the shared base/rough/metal textures after cloning so all
      // clones share the GPU texture (we already detached from FBX-embedded
      // texture paths, so this is just a stable pointer assignment).
    }
  });

  // Apply the scaleFactor that loadVendorTemplate computed from the GLB
  // bounding box, and lift the model so its base sits on y=0 instead of
  // floating at the GLB's internal origin. (Restored after 99fd652 dropped
  // both lines — without them vendor stalls came out at 1.8m tall and
  // hovering in the air.)
  clone.scale.setScalar(scaleFactor);
  const bbox = new THREE.Box3().setFromObject(clone);
  const minY = bbox.min.y;
  clone.position.y = -minY;
  clone.updateWorldMatrix(true, true);

  return clone;
}

export function getVendorScaleFactor(): number {
  return scaleFactor;
}