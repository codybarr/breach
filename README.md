# BREACH.EXE

Play: [https://breach.codybarr.dev](https://breach.codybarr.dev)

![BREACH.EXE gameplay](screenshot.png)

## Tech

- TypeScript, Three.js, Vite
- Bun HTTP/WebSocket server (LAN), Cloudflare Workers + Durable Objects (hosted)
- Vitest, Playwright

## Setup & run

Install [Bun](https://bun.sh), then:

```sh
bun install
bun run serve
```

Open http://localhost:8080. This builds the game and starts the multiplayer server.

For development with hot reload, run these in separate terminals:

```sh
bun run server
bun run dev
```

Open http://localhost:5173.

## Deploy to Cloudflare

The game runs on Cloudflare Workers. Static assets serve `dist/`, and a Durable Object (`worker/index.ts`) runs the multiplayer lobby, the same `Lobby` the Bun server uses.

```sh
bunx wrangler login     # once
bun run deploy          # typecheck, build, and deploy
```

To try the Workers build locally, run `bun run cf:dev`. To serve it on a custom domain, uncomment the `routes` entry in `wrangler.jsonc`.
