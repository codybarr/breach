import { CLIENT_STALE_MS, PING_MS, type ClientMsg, type ServerMsg } from './protocol';

const SESSION_KEY = 'breach.session';
const HANDLE_KEY = 'breach.handle';

export interface Session {
  room: string;
  token: string;
}

/** The match this tab is seated in. sessionStorage survives a reload but not a new tab, so two tabs can play each other. */
export const session = {
  get(): Session | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
      return s && typeof s.room === 'string' && typeof s.token === 'string' ? s : null;
    } catch {
      return null;
    }
  },
  set(s: Session) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  },
  clear() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  },
};

const HANDLE_WORDS = ['NULL', 'ZERO', 'GLITCH', 'ROOT', 'NOVA', 'CIPHER', 'HEX', 'VECTOR', 'SPOOF', 'DAEMON'];

export const handle = {
  get(): string {
    try {
      const h = localStorage.getItem(HANDLE_KEY);
      if (h) return h;
    } catch { /* ignore */ }
    const h = `${HANDLE_WORDS[Math.floor(Math.random() * HANDLE_WORDS.length)]}_${Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0')}`;
    this.set(h);
    return h;
  },
  set(h: string) {
    try { localStorage.setItem(HANDLE_KEY, h); } catch { /* ignore */ }
  },
};

/** A tab coming back to the foreground (or the network returning) gets this long to hear from the server. */
const PROBE_MS = 3_000;

/**
 * WebSocket to the LAN relay with automatic reconnect. Scenes take turns
 * owning it by assigning `onMessage` / `onOpen` / `onStatus`.
 *
 * A socket can die without a close event (Wi-Fi drop, laptop lid, phone
 * screen off), leaving `up` true while nothing gets through. So we ping on a
 * timer and treat a server that has gone quiet as gone: drop the socket and
 * reconnect, which makes the owning scene rejoin and resync.
 */
export class NetClient {
  up = false;
  onMessage: ((m: ServerMsg) => void) | null = null;
  /** Fires on every (re)connect — the place to send 'list' or 'rejoin'. */
  onOpen: (() => void) | null = null;
  onStatus: ((up: boolean) => void) | null = null;
  /** True once at least one connection has succeeded. */
  everUp = false;

  private ws: WebSocket | null = null;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval>;
  /** When the current socket was created / last delivered anything / was last pinged. */
  private openedAt = 0;
  private lastRx = 0;
  private lastPing = 0;
  /** If set, the server must say something by then or the socket is presumed dead. */
  private probeBy = 0;

  constructor(private url = defaultUrl()) {
    this.open();
    this.tick = setInterval(() => this.check(), 1000);
    addEventListener('visibilitychange', this.probe);
    addEventListener('online', this.probe);
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    clearInterval(this.tick);
    removeEventListener('visibilitychange', this.probe);
    removeEventListener('online', this.probe);
    this.ws?.close();
    this.onMessage = this.onOpen = this.onStatus = null;
  }

  /** Ask the server for a sign of life now (e.g. the tab was asleep and the socket may be long dead). */
  private probe = () => {
    if (document.visibilityState === 'hidden' || this.ws?.readyState !== WebSocket.OPEN) return;
    this.probeBy = performance.now() + PROBE_MS;
    this.ping();
  };

  private ping() {
    this.lastPing = performance.now();
    this.send({ t: 'ping' });
  }

  private check() {
    const ws = this.ws;
    if (!ws || this.closed) return;
    const now = performance.now();
    if (ws.readyState === WebSocket.CONNECTING) {
      if (now - this.openedAt > CLIENT_STALE_MS) this.drop(); // handshake stuck on a dead network
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) return;
    if (now - this.lastRx > CLIENT_STALE_MS || (this.probeBy && now > this.probeBy)) {
      this.drop();
      return;
    }
    if (now - this.lastPing >= PING_MS) this.ping();
  }

  /** Abandon the current socket without waiting for a close event that may never come, and reconnect. */
  private drop() {
    const ws = this.ws;
    this.ws = null; // its late events are ignored from here on
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = null;
      try { ws.close(); } catch { /* ignore */ }
    }
    const was = this.up;
    this.up = false;
    if (was) this.onStatus?.(false);
    if (this.retry) clearTimeout(this.retry);
    if (!this.closed) this.retry = setTimeout(() => this.open(), 250);
  }

  private open() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    this.openedAt = performance.now();
    this.probeBy = 0;
    ws.onopen = () => {
      this.lastRx = performance.now();
      this.up = this.everUp = true;
      this.onStatus?.(true);
      this.onOpen?.();
    };
    ws.onmessage = (e) => {
      this.lastRx = performance.now();
      this.probeBy = 0;
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.onMessage?.(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const was = this.up;
      this.up = false;
      if (was) this.onStatus?.(false);
      if (!this.closed) this.retry = setTimeout(() => this.open(), 1000);
    };
  }
}

function defaultUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
