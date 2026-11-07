import type { Action, SeatedAction } from './actions';

export const GRACE_MS = 60_000;
/** Clients ping this often so a silently dead link (Wi-Fi blip, sleeping phone) is noticed. */
export const PING_MS = 4_000;
/** Client: no traffic from the server for this long → assume the socket is dead and reconnect. */
export const CLIENT_STALE_MS = 10_000;
/** Server: no traffic from a client for this long → drop it (the opponent then sees the reconnect countdown). */
export const SERVER_IDLE_MS = 20_000;

export interface RoomInfo {
  id: string;
  host: string;
}

/** Everything a client needs to (re)build a match: same seed + same actions = same game. */
export interface MatchStart {
  t: 'start';
  room: string;
  token: string;
  seat: number;
  seed: number;
  names: [string, string];
  log: SeatedAction[];
  /** Whether the opponent is currently connected. */
  peerUp: boolean;
  /** If the opponent is disconnected: ms left before they forfeit. */
  graceMs?: number;
}

export type ClientMsg =
  | { t: 'list' }
  | { t: 'host'; name: string }
  | { t: 'join'; room: string; name: string }
  | { t: 'leave' }
  | { t: 'rejoin'; room: string; token: string }
  | { t: 'act'; action: Action }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'hosted'; room: string }
  | MatchStart
  | { t: 'act'; n: number; seat: number; action: Action }
  | { t: 'peer'; up: boolean; graceMs?: number }
  | { t: 'error'; msg: string }
  /** Reply to 'ping'. n = actions in your match so far (so a client can spot missed ones); null = not seated in a match. */
  | { t: 'pong'; n: number | null };

/** Handles are shown on the board and in the log: keep them short and plain. */
export function cleanName(raw: unknown): string {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
  return s || 'ANON';
}
