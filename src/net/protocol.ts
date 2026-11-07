import type { Action, SeatedAction } from './actions';

export const GRACE_MS = 60_000;

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
  | { t: 'act'; action: Action };

export type ServerMsg =
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'hosted'; room: string }
  | MatchStart
  | { t: 'act'; n: number; seat: number; action: Action }
  | { t: 'peer'; up: boolean; graceMs?: number }
  | { t: 'error'; msg: string };

/** Handles are shown on the board and in the log: keep them short and plain. */
export function cleanName(raw: unknown): string {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
  return s || 'ANON';
}
