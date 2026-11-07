import { Game } from '../src/engine/game';
import { applyAction, isAction, type SeatedAction } from '../src/net/actions';
import { GRACE_MS, cleanName, type ClientMsg, type MatchStart, type RoomInfo, type ServerMsg } from '../src/net/protocol';

/** One connected browser tab. */
export interface Conn {
  send(msg: ServerMsg): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

interface Room {
  id: string;
  names: [string, string | null];
  tokens: [string, string | null];
  conns: [Conn | null, Conn | null];
  seed: number;
  game: Game | null; // null while waiting for a guest
  log: SeatedAction[];
  graceTimers: [unknown, unknown];
  graceEnds: [number, number];
  cleanup: unknown;
}

/** Room ids skip look-alike characters so they're easy to read aloud. */
const ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * The LAN relay. Keeps the room list, pairs host + guest, and referees matches:
 * it replays every action on its own copy of the Game, so an illegal or
 * out-of-turn action is rejected before it reaches the other player.
 */
export class Lobby {
  private rooms = new Map<string, Room>();
  private seatOf = new Map<Conn, { room: Room; seat: number }>();
  private browsers = new Set<Conn>();
  private graceMs: number;
  private timers: Timers;
  private now: () => number;

  constructor(opts: { graceMs?: number; timers?: Timers; now?: () => number } = {}) {
    this.graceMs = opts.graceMs ?? GRACE_MS;
    this.timers = opts.timers ?? realTimers;
    this.now = opts.now ?? Date.now;
  }

  connect(conn: Conn) {
    this.browsers.add(conn);
  }

  message(conn: Conn, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as ClientMsg;
    switch (msg.t) {
      case 'list': this.browsers.add(conn); conn.send(this.roomList()); break;
      case 'host': this.host(conn, cleanName(msg.name)); break;
      case 'join': this.join(conn, String(msg.room), cleanName(msg.name)); break;
      case 'leave': this.leave(conn); break;
      case 'rejoin': this.rejoin(conn, String(msg.room), String(msg.token)); break;
      case 'act': this.act(conn, msg.action); break;
    }
  }

  disconnect(conn: Conn) {
    this.browsers.delete(conn);
    const at = this.seatOf.get(conn);
    if (!at) return;
    this.seatOf.delete(conn);
    const { room, seat } = at;
    if (room.conns[seat] !== conn) return;
    room.conns[seat] = null;
    if (!room.game) {
      // Host walked away before anyone joined.
      this.closeRoom(room);
      return;
    }
    if (room.game.over) {
      if (!room.conns[1 - seat]) this.closeRoom(room);
      return;
    }
    room.graceEnds[seat] = this.now() + this.graceMs;
    room.graceTimers[seat] = this.timers.set(() => this.timeout(room, seat), this.graceMs);
    room.conns[1 - seat]?.send({ t: 'peer', up: false, graceMs: this.graceMs });
  }

  /** For tests / logging. */
  get roomCount() {
    return this.rooms.size;
  }

  // ───────────────────────── lobby ─────────────────────────

  private roomList(): ServerMsg {
    const rooms: RoomInfo[] = [];
    for (const r of this.rooms.values()) if (!r.game) rooms.push({ id: r.id, host: r.names[0] });
    return { t: 'rooms', rooms };
  }

  private broadcastRooms() {
    const msg = this.roomList();
    for (const c of this.browsers) c.send(msg);
  }

  private host(conn: Conn, name: string) {
    this.leave(conn);
    let id = '';
    do id = Array.from({ length: 4 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
    while (this.rooms.has(id));
    const room: Room = {
      id, names: [name, null], tokens: [crypto.randomUUID(), null], conns: [conn, null],
      seed: (Math.random() * 2 ** 31) | 0, game: null, log: [],
      graceTimers: [null, null], graceEnds: [0, 0], cleanup: null,
    };
    this.rooms.set(id, room);
    this.seatOf.set(conn, { room, seat: 0 });
    this.browsers.delete(conn);
    conn.send({ t: 'hosted', room: id });
    this.broadcastRooms();
  }

  private join(conn: Conn, id: string, name: string) {
    const room = this.rooms.get(id);
    if (!room || room.game || !room.conns[0]) {
      conn.send({ t: 'error', msg: 'session no longer available' });
      conn.send(this.roomList());
      return;
    }
    if (room.conns[0] === conn) return;
    this.leave(conn);
    if (name === room.names[0]) name = `${name.slice(0, 10)}_2`;
    room.names[1] = name;
    room.tokens[1] = crypto.randomUUID();
    room.conns[1] = conn;
    room.game = new Game({ seed: room.seed, names: [room.names[0], name], aiFlags: [false, false] });
    room.game.events.length = 0;
    this.seatOf.set(conn, { room, seat: 1 });
    this.browsers.delete(conn);
    for (const seat of [0, 1]) room.conns[seat]!.send(this.startMsg(room, seat));
    this.broadcastRooms();
  }

  /** Cancel hosting, or walk away from a finished match. Leaving a live match is a forfeit via 'act'. */
  private leave(conn: Conn) {
    const at = this.seatOf.get(conn);
    if (!at) return;
    const { room, seat } = at;
    if (room.game && !room.game.over) return;
    this.seatOf.delete(conn);
    room.conns[seat] = null;
    this.browsers.add(conn);
    if (!room.game || !room.conns[1 - seat]) this.closeRoom(room);
  }

  private rejoin(conn: Conn, id: string, token: string) {
    const room = this.rooms.get(id);
    const seat = room ? room.tokens.indexOf(token) : -1;
    if (!room || !room.game || seat < 0) {
      conn.send({ t: 'error', msg: 'session expired' });
      return;
    }
    const old = room.conns[seat];
    if (old && old !== conn) this.seatOf.delete(old);
    room.conns[seat] = conn;
    this.seatOf.set(conn, { room, seat });
    this.browsers.delete(conn);
    if (room.graceTimers[seat] !== null) {
      this.timers.clear(room.graceTimers[seat]);
      room.graceTimers[seat] = null;
      room.conns[1 - seat]?.send({ t: 'peer', up: true });
    }
    conn.send(this.startMsg(room, seat));
  }

  // ───────────────────────── match ─────────────────────────

  private startMsg(room: Room, seat: number): MatchStart {
    const other = 1 - seat;
    const peerUp = !!room.conns[other];
    return {
      t: 'start', room: room.id, token: room.tokens[seat]!, seat, seed: room.seed,
      names: [room.names[0], room.names[1]!], log: room.log, peerUp,
      graceMs: peerUp ? undefined : Math.max(0, room.graceEnds[other] - this.now()),
    };
  }

  private act(conn: Conn, action: unknown) {
    const at = this.seatOf.get(conn);
    if (!at || !at.room.game || !isAction(action)) return;
    const { room, seat } = at;
    // The match is paused while either side is reconnecting — except you may always concede.
    if (action.k !== 'forfeit' && (!room.conns[0] || !room.conns[1])) {
      conn.send({ t: 'error', msg: 'match paused' });
      return;
    }
    if (action.k === 'forfeit' && action.reason !== 'abort') return; // timeouts are the server's call
    this.commit(room, seat, action);
  }

  private commit(room: Room, seat: number, action: SeatedAction['action']) {
    const g = room.game!;
    if (!applyAction(g, seat, action)) {
      room.conns[seat]?.send({ t: 'error', msg: 'illegal action' });
      return;
    }
    g.events.length = 0;
    const n = room.log.length;
    room.log.push({ seat, action });
    for (const c of room.conns) c?.send({ t: 'act', n, seat, action });
    if (g.over) {
      for (const s of [0, 1]) {
        if (room.graceTimers[s] !== null) this.timers.clear(room.graceTimers[s]);
        room.graceTimers[s] = null;
      }
      // Keep the room briefly so a reload still shows the result.
      room.cleanup = this.timers.set(() => this.closeRoom(room), this.graceMs);
    }
  }

  private timeout(room: Room, seat: number) {
    room.graceTimers[seat] = null;
    if (!room.game || room.game.over) return;
    if (!room.conns[0] && !room.conns[1]) {
      this.closeRoom(room);
      return;
    }
    this.commit(room, seat, { k: 'forfeit', reason: 'timeout' });
  }

  private closeRoom(room: Room) {
    if (this.rooms.get(room.id) !== room) return;
    this.rooms.delete(room.id);
    for (const t of [...room.graceTimers, room.cleanup]) if (t !== null) this.timers.clear(t);
    for (const c of room.conns) {
      if (!c) continue;
      this.seatOf.delete(c);
      this.browsers.add(c);
    }
    this.broadcastRooms();
  }
}
