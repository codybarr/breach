import type { ClientMsg, ServerMsg } from './protocol';

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

/**
 * WebSocket to the LAN relay with automatic reconnect. Scenes take turns
 * owning it by assigning `onMessage` / `onOpen` / `onStatus`.
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

  constructor(private url = defaultUrl()) {
    this.open();
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close();
    this.onMessage = this.onOpen = this.onStatus = null;
  }

  private open() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.up = this.everUp = true;
      this.onStatus?.(true);
      this.onOpen?.();
    };
    ws.onmessage = (e) => {
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
