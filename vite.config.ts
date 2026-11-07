import { defineConfig } from 'vite';

// In dev, run `bun run server` alongside `bun run dev`; the websocket is proxied to it.
export default defineConfig({
  server: {
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
});
