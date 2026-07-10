import { defineConfig, type Plugin } from 'vite';

// Base public path for built assets.
//   - '/deer-game/'   → production at http://1.12.51.118/deer-game/ (nginx alias)
//   - '/'             → production at root (if ever moved off the /deer-game/ sub-path)
const base = process.env.VITE_BASE ?? '/deer-game/';

/**
 * Vite plugin: after the build writes assets/, scan for any GLB / FBX files
 * (the heavy 3D models) and inject <link rel="preload" as="fetch" crossorigin>
 * tags into the emitted index.html.
 *
 * Why: the GLB is ~5 MB and starts downloading only when main.ts reaches
 * `loadDeerTemplate()`. With preload hints the browser starts the request
 * the moment it sees index.html — saving the network round-trip latency
 * (typically 50-200 ms on broadband, several seconds on 4G). The first-paint
 * is unchanged because preloads are low-priority by default.
 */
function preloadHeavyAssetsPlugin(): Plugin {
  return {
    name: 'naradeer:preload-heavy-assets',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const heavyAssets = Object.keys(ctx.bundle ?? {}).filter(
          (name) => /\.(glb|fbx)$/i.test(name) && name.startsWith('assets/'),
        );
        if (heavyAssets.length === 0) return html;
        const tags = heavyAssets
          .map(
            (name) =>
              `<link rel="preload" href="${base}${name}" as="fetch" type="model/gltf-binary" crossorigin="anonymous">`,
          )
          .join('\n    ');
        return html.replace(/<title>/, `${tags}\n    <title>`);
      },
    },
  };
}

export default defineConfig({
  base,
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  plugins: [preloadHeavyAssetsPlugin()],
  build: {
    // No source maps in production — keeps the deployed bundle smaller and
    // avoids leaking the source layout to public visitors.
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
