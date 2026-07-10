import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AssetProgress = { loaded: number; total: number };

/**
 * Fetch a binary asset with real byte-level progress (Content-Length aware).
 * Falls back to indeterminate progress (total = 0) when the server doesn't
 * advertise a length (HTTP/2 + nginx usually does).
 *
 * Emits `onProgress` repeatedly as bytes arrive, so the loading bar moves
 * smoothly instead of stuck at 0% until each request finishes (which was the
 * #1 UX complaint before this helper existed).
 */
export async function fetchWithProgress(
  url: string,
  onProgress?: (p: AssetProgress) => void,
): Promise<Blob> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);

  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body) {
    onProgress?.({ loaded: 0, total: 0 });
    return res.blob();
  }

  const reader = res.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let loaded = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      // Copy into a fresh ArrayBuffer so the type aligns with BlobPart[]
      // (Uint8Array<ArrayBufferLike> from getReader isn't a valid BlobPart
      // because its backing buffer might be SharedArrayBuffer).
      const buf = new ArrayBuffer(value.byteLength);
      new Uint8Array(buf).set(value);
      chunks.push(buf);
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
    }
  }

  onProgress?.({ loaded, total: total || loaded });
  return new Blob(chunks);
}

/**
 * Load a texture (any format Three.js' TextureLoader handles — png, webp, jpg)
 * with byte-level progress. Uses fetchWithProgress + a Blob URL so the existing
 * TextureLoader still does the GPU upload step (which we can't measure, but
 * it's the network that's the bottleneck, not decode).
 */
export async function loadTextureWithProgress(
  url: string,
  texLoader: THREE.TextureLoader,
  onProgress?: (p: AssetProgress) => void,
): Promise<THREE.Texture> {
  const blob = await fetchWithProgress(url, onProgress);
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await texLoader.loadAsync(blobUrl);
  } finally {
    // Defer revoke so the GPU upload can finish reading the Blob bytes first.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  }
}

/**
 * Load an FBX with byte-level progress. Streams into an ArrayBuffer, then
 * hands it to FBXLoader.parse() so we never lose progress signal the way
 * fbxLoader.loadAsync(url) would (which offers no progress callback).
 */
export async function loadFbxWithProgress(
  url: string,
  fbxLoader: { parse: (data: ArrayBuffer, path: string) => THREE.Group },
  onProgress?: (p: AssetProgress) => void,
): Promise<THREE.Group> {
  const blob = await fetchWithProgress(url, onProgress);
  const buf = await blob.arrayBuffer();
  return fbxLoader.parse(buf, url);
}

/**
 * Load a glTF/GLB with byte-level progress. Uses GLTFLoader's native
 * `onProgress` callback (already reports bytes-loaded/total) and resolves
 * with the full gltf object so the caller can grab `gltf.scene` and
 * `gltf.animations`.
 *
 * Why we prefer this over FBXLoader:
 *   - GLB is structured binary: parses in <100 ms (vs FBX's 2-5 s)
 *   - GLB includes animation + skeleton + skin in one file
 *   - 2026-07-10 switch: naradeer was hitting a 3-5 s UI freeze on click
 *     because FBXLoader.parse() blocks the main thread. GLB cut that to
 *     near-instant.
 */
export function loadGltfWithProgress(
  url: string,
  gltfLoader: {
    load: (
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (err: unknown) => void,
    ) => void;
  },
  onProgress?: (p: AssetProgress) => void,
): Promise<GLTF> {
  return new Promise<GLTF>((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf),
      (event) => {
        if (event.lengthComputable) {
          onProgress?.({ loaded: event.loaded, total: event.total });
        }
      },
      (err) => reject(err),
    );
  });
}