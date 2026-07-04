import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

import fbxUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture.fbx?url';
import texUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture.png?url';
import texRoughnessUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture_roughness.png?url';
import texMetallicUrl from '../../asset/Meshy_Nature_Explorer/Meshy_AI_Nature_Explorer_0704141526_texture_metallic.png?url';

const TARGET_HEIGHT = 0.65;

let template: THREE.Group | null = null;
let scaleFactor = 1;
let texturesLoaded = false;
let baseMap: THREE.Texture | null = null;
let roughMap: THREE.Texture | null = null;
let metalMap: THREE.Texture | null = null;

const texLoader = new THREE.TextureLoader();

export async function loadVendorTemplate(): Promise<void> {
  if (template) return;

  // Try to load textures
  try {
    [baseMap, roughMap, metalMap] = await Promise.all([
      texLoader.loadAsync(texUrl),
      texLoader.loadAsync(texRoughnessUrl),
      texLoader.loadAsync(texMetallicUrl),
    ]);
    texturesLoaded = true;
  } catch (err) {
    console.warn('[VendorModel] Textures failed to load, using solid color');
  }

  // Load FBX with a manager that suppresses internal texture requests
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg')) {
      return 'data:image/png,';
    }
    return url;
  });

  const fbxLoader = new FBXLoader(manager);
  const fbxGroup = await fbxLoader.loadAsync(fbxUrl);

  // Calculate proper scale
  const box = new THREE.Box3().setFromObject(fbxGroup);
  const originalHeight = box.max.y - box.min.y;
  scaleFactor = TARGET_HEIGHT / originalHeight;
  console.log(`[VendorModel] original height: ${originalHeight.toFixed(3)}, scale: ${scaleFactor.toFixed(3)}`);

  fbxGroup.traverse((child: THREE.Object3D) => {
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

  template = fbxGroup;
  console.log(`[VendorModel] loaded template`);
}

export function cloneVendorTemplate(): THREE.Group {
  if (!template) throw new Error('Vendor template not loaded.');

  const clone = SkeletonUtils.clone(template) as THREE.Group;

  clone.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.geometry = child.geometry.clone();
      child.frustumCulled = false;
    }
  });

  clone.scale.setScalar(scaleFactor);

  // Offset so the model sits on the ground (origin at bottom center)
  const bbox = new THREE.Box3().setFromObject(clone);
  const minY = bbox.min.y;
  clone.position.y = -minY;

  clone.updateWorldMatrix(true, true);

  return clone;
}
