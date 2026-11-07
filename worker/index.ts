/**
 * Cloudflare deployment: static assets serve the built game from dist/, and
 * /ws is routed to a single Durable Object that runs the same Lobby as the
 * Bun LAN server (server/main.ts).
 *   bun run deploy
 */
import { DurableObject } from 'cloudflare:workers';
import { Lobby, type Conn } from '../server/lobby';

interface Env {
  LOBBY: DurableObjectNamespace<LobbyDO>;
  ASSETS: Fetcher;
}

const MAX_PAYLOAD = 64 * 1024;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      // One global lobby, so everyone sees the same room list.
      return env.LOBBY.get(env.LOBBY.idFromName('global')).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

/**
 * Holds every room in memory. Sockets are accepted without hibernation so the
 * object (and its timers) stays alive while anyone is connected; when the last
 * socket closes the object may be evicted, which is fine — there is nothing
 * left to keep.
 */
export class LobbyDO extends DurableObject<Env> {
  private lobby = new Lobby();

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const { 0: client, 1: ws } = new WebSocketPair();
    ws.accept();

    let gone = false;
    const conn: Conn = {
      send: (m) => {
        try {
          ws.send(JSON.stringify(m));
        } catch {
          /* socket already closing */
        }
      },
      close: () => {
        gone = true; // the lobby already dropped us
        try {
          ws.close(4000, 'idle');
        } catch {
          /* already closed */
        }
      },
    };
    this.lobby.connect(conn);

    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data.length > MAX_PAYLOAD) return;
      let msg: unknown;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.lobby.message(conn, msg);
    });
    const drop = () => {
      if (gone) return;
      gone = true;
      this.lobby.disconnect(conn);
    };
    ws.addEventListener('close', drop);
    ws.addEventListener('error', drop);

    return new Response(null, { status: 101, webSocket: client });
  }
}
