/**
 * LAN server: serves the built game from dist/ and relays matches over /ws.
 *   bun run serve          (builds first)
 *   PORT=9000 bun server/main.ts
 */
import { networkInterfaces } from 'node:os';
import { join, normalize, sep } from 'node:path';
import { Lobby, type Conn } from './lobby';

const PORT = Number(process.env.PORT ?? 8080);
const DIST = normalize(join(import.meta.dir, '..', 'dist'));
const lobby = new Lobby();

const hasBuild = await Bun.file(join(DIST, 'index.html')).exists();

Bun.serve<{ conn: Conn | null }>({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (server.upgrade(req, { data: { conn: null } })) return;
      return new Response('websocket upgrade failed', { status: 400 });
    }
    if (!hasBuild) return new Response('No build found. Run `bun run serve` (or `bun run build` first).', { status: 503 });
    let rel: string;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return new Response('bad path', { status: 400 });
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const path = normalize(join(DIST, rel));
    if (!path.startsWith(DIST + sep)) return new Response('not found', { status: 404 });
    const file = Bun.file(path);
    if (await file.exists()) return new Response(file);
    return new Response(Bun.file(join(DIST, 'index.html')));
  },
  websocket: {
    maxPayloadLength: 64 * 1024,
    open(ws) {
      const conn: Conn = { send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close(4000, 'idle') };
      ws.data.conn = conn;
      lobby.connect(conn);
    },
    message(ws, raw) {
      let msg: unknown;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (ws.data.conn) lobby.message(ws.data.conn, msg);
    },
    close(ws) {
      if (ws.data.conn) lobby.disconnect(ws.data.conn);
    },
  },
});

const ips = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a!.address);
console.log(`BREACH.EXE relay up on port ${PORT}`);
if (!hasBuild) console.log('  (no dist/ build — only the websocket relay is live)');
console.log(`  this machine:  http://localhost:${PORT}`);
for (const ip of ips) console.log(`  on your LAN:   http://${ip}:${PORT}`);
