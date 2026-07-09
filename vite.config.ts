import { defineConfig } from 'vite';

// Base public path for built assets.
//   - '/deer-game/'   → production at http://1.12.51.118/deer-game/ (nginx alias)
//   - '/'             → production at root (if ever moved off the /deer-game/ sub-path)
const base = process.env.VITE_BASE ?? '/deer-game/';

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
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
