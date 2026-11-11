# BREACH.EXE

Play: [https://breach.codybarr.dev](https://breach.codybarr.dev)

![BREACH.EXE gameplay](screenshot.png)

## Tech

BREACH.EXE is a browser card game written entirely in TypeScript, with `three` as its only runtime dependency.

- **Language and tooling**
  - TypeScript in strict mode, with separate type-check configs for the client, `server/`, and `worker/`
  - Bun as the package manager and script runner
  - Vite for the dev server and production build, with `/ws` proxied to the local game server in dev
- **Rendering**
  - Three.js on WebGL, using an orthographic camera for the 2D-style stage
  - Post-processing through `EffectComposer`, with bloom and custom shader passes for the CRT look
  - Custom GLSL via `ShaderMaterial` for the background
  - Card art and UI drawn procedurally with Canvas 2D and uploaded as `CanvasTexture`s
- **Audio**
  - Web Audio API, with sound effects synthesized from oscillators and noise buffers rather than audio files
- **Front-end platform**
  - Plain HTML and DOM with no UI framework; scenes are hand-written classes
  - Installable web app through a web manifest, plus the Fullscreen API for mobile (no service worker or offline support)
  - `localStorage` for small preferences like player handle and volume
  - Google Fonts (Share Tech Mono and VT323)
- **Multiplayer**
  - WebSockets with JSON messages and automatic reconnect
  - One shared `Lobby` implementation with two hosts:
    - **LAN or local:** `Bun.serve` for HTTP and WebSocket
    - **Hosted:** a Cloudflare Worker with one global SQLite-backed Durable Object
- **Hosting**
  - Cloudflare Workers Static Assets serves `dist/`, deployed manually with Wrangler, with Workers observability on
- **Testing**
  - Vitest for the game simulation, networking, match timer, and card behavior
  - Playwright is installed as a dev dependency but isn't used by the test suite

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
