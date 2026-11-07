import { describe, expect, it } from 'vitest';
import { Lobby, type Conn, type Timers } from '../server/lobby';
import { AI } from '../src/engine/ai';
import { Game } from '../src/engine/game';
import { applyAction, isAction, type Action } from '../src/net/actions';
import type { MatchStart, ServerMsg } from '../src/net/protocol';

/** Timers you fire by hand. */
function manualTimers() {
  const pending = new Map<number, () => void>();
  let id = 0;
  const timers: Timers = {
    set: (fn) => { pending.set(++id, fn); return id; },
    clear: (h) => { pending.delete(h as number); },
  };
  return { timers, fireAll: () => { for (const [k, fn] of [...pending]) { pending.delete(k); fn(); } }, count: () => pending.size };
}

/** A fake browser tab: records messages and mirrors the match the way GameScene does. */
class FakeClient implements Conn {
  inbox: ServerMsg[] = [];
  game: Game | null = null;
  seat = -1;
  start: MatchStart | null = null;
  applied = 0;
  send(m: ServerMsg) {
    this.inbox.push(m);
    if (m.t === 'start') {
      this.start = m;
      this.seat = m.seat;
      if (!this.game) this.game = new Game({ seed: m.seed, names: m.names, aiFlags: [false, false] });
      for (const { seat, action } of m.log.slice(this.applied)) applyAction(this.game, seat, action);
      this.applied = Math.max(this.applied, m.log.length);
    }
    if (m.t === 'act' && this.game && m.n === this.applied) {
      applyAction(this.game, m.seat, m.action);
      this.applied++;
    }
  }
  last<T extends ServerMsg['t']>(t: T) {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

/** A simple action policy, expressed as Actions so it goes over the "wire". */
function chooseAction(g: Game, seat: number, ai: AI): Action | null {
  if (g.over) return null;
  if (g.pending) return g.pending.player === seat ? { k: 'answer', a: ai.answer(g, g.pending) } : null;
  if (g.current !== seat) return null;
  const s = g.players[seat];
  const prog = g.phase === 'action' && s.cycles > 0 && s.hand.find((c) => g.def(c).kind === 'program');
  if (prog) return { k: 'play', card: prog.id };
  if (s.hand.some((c) => g.def(c).kind === 'currency')) return { k: 'currency' };
  const best = g.piles.filter((id) => id !== 'malware' && g.canBuy(seat, id)).sort((a, b) => g.def(b).cost - g.def(a).cost)[0];
  if (best && g.def(best).cost >= 3) return { k: 'buy', pile: best };
  return { k: 'end' };
}

function setup() {
  const t = manualTimers();
  const lobby = new Lobby({ graceMs: 60_000, timers: t.timers });
  const host = new FakeClient();
  const guest = new FakeClient();
  lobby.connect(host);
  lobby.connect(guest);
  lobby.message(guest, { t: 'list' });
  lobby.message(host, { t: 'host', name: 'neo' });
  const room = guest.last('rooms')!.rooms[0];
  lobby.message(guest, { t: 'join', room: room.id, name: 'trin!ty' });
  return { lobby, host, guest, room, t };
}

describe('LAN relay', () => {
  it('lists a hosted room and seats host + guest with the same seed', () => {
    const t = manualTimers();
    const lobby = new Lobby({ timers: t.timers });
    const host = new FakeClient(), guest = new FakeClient(), watcher = new FakeClient();
    for (const c of [host, guest, watcher]) { lobby.connect(c); lobby.message(c, { t: 'list' }); }
    lobby.message(host, { t: 'host', name: 'neo' });
    const room = watcher.last('rooms')!.rooms[0];
    lobby.message(guest, { t: 'join', room: room.id, name: 'trin!ty' });
    expect(room.host).toBe('NEO');
    expect(host.start!.seat).toBe(0);
    expect(guest.start!.seat).toBe(1);
    expect(host.start!.seed).toBe(guest.start!.seed);
    expect(guest.start!.names).toEqual(['NEO', 'TRINTY']);
    expect(host.start!.token).not.toBe(guest.start!.token);
    // Room disappears from the list once the match starts.
    expect(watcher.last('rooms')!.rooms).toEqual([]);
  });

  it('a full match stays in sync on both clients', () => {
    const { lobby, host, guest } = setup();
    const ais = [new AI(0, 'hard'), new AI(1, 'hard')];
    const clients = [host, guest];
    let steps = 0;
    while (!host.game!.over && steps++ < 5000) {
      // Whoever the (host's copy of the) game is waiting on picks a move.
      const g = host.game!;
      const seat = g.pending ? g.pending.player : g.current;
      const c = clients[seat];
      const a = chooseAction(c.game!, seat, ais[seat]);
      expect(a).not.toBeNull();
      lobby.message(c, { t: 'act', action: a! });
    }
    expect(host.game!.over).toBeTruthy();
    expect(guest.game!.over).toEqual(host.game!.over);
    expect(JSON.stringify(guest.game!.players)).toBe(JSON.stringify(host.game!.players));
    expect(guest.game!.supply).toEqual(host.game!.supply);
    expect(host.inbox.some((m) => m.t === 'error')).toBe(false);
  });

  it('rejects out-of-turn and malformed actions without broadcasting them', () => {
    const { lobby, host, guest } = setup();
    const waiting = host.game!.current === 0 ? guest : host;
    const before = host.applied;
    lobby.message(waiting, { t: 'act', action: { k: 'end' } });
    lobby.message(waiting, { t: 'act', action: { k: 'buy', pile: 42 } });
    expect(waiting.last('error')?.msg).toBe('illegal action');
    expect(host.applied).toBe(before);
    expect(guest.applied).toBe(before);
  });

  it('pauses on disconnect and resumes with full history on rejoin', () => {
    const { lobby, host, guest } = setup();
    const active = host.game!.current === 0 ? host : guest;
    lobby.message(active, { t: 'act', action: { k: 'currency' } });
    const token = guest.start!.token, room = guest.start!.room;

    lobby.disconnect(guest);
    expect(host.last('peer')).toEqual({ t: 'peer', up: false, graceMs: 60_000 });
    lobby.message(host, { t: 'act', action: { k: 'end' } });
    expect(host.last('error')?.msg).toBe('match paused');

    // Reloaded tab: brand-new connection and a blank game, rebuilt from the log.
    const back = new FakeClient();
    lobby.connect(back);
    lobby.message(back, { t: 'rejoin', room, token: 'wrong' });
    expect(back.last('error')?.msg).toBe('session expired');
    lobby.message(back, { t: 'rejoin', room, token });
    expect(back.start!.seat).toBe(1);
    expect(back.start!.peerUp).toBe(true);
    expect(JSON.stringify(back.game!.players)).toBe(JSON.stringify(host.game!.players));
    expect(host.last('peer')).toEqual({ t: 'peer', up: true });
  });

  it('forfeits the absent player when the grace period runs out', () => {
    const { lobby, host, guest, t } = setup();
    lobby.disconnect(guest);
    t.fireAll();
    const over = host.game!.over!;
    expect(over.winner).toBe(0);
    expect(over.reason).toBe('TRINTY LINK TIMED OUT');
    expect(host.last('act')!.action).toEqual({ k: 'forfeit', reason: 'timeout' });
  });

  it('lets a player concede, but not claim a timeout for the other side', () => {
    const { lobby, host, guest } = setup();
    lobby.message(host, { t: 'act', action: { k: 'forfeit', reason: 'timeout' } });
    expect(host.game!.over).toBeNull();
    lobby.message(host, { t: 'act', action: { k: 'forfeit', reason: 'abort' } });
    expect(guest.game!.over!.winner).toBe(1);
    expect(guest.game!.over!.reason).toBe('NEO ABORTED');
  });

  it('drops a waiting room when the host cancels or disconnects', () => {
    const t = manualTimers();
    const lobby = new Lobby({ timers: t.timers });
    const a = new FakeClient(), b = new FakeClient();
    lobby.connect(a); lobby.connect(b);
    lobby.message(b, { t: 'list' });
    lobby.message(a, { t: 'host', name: 'x' });
    expect(b.last('rooms')!.rooms).toHaveLength(1);
    lobby.message(a, { t: 'leave' });
    expect(b.last('rooms')!.rooms).toHaveLength(0);
    lobby.message(a, { t: 'host', name: 'x' });
    lobby.disconnect(a);
    expect(b.last('rooms')!.rooms).toHaveLength(0);
    expect(lobby.roomCount).toBe(0);
  });

  it('isAction rejects junk', () => {
    expect(isAction({ k: 'play', card: 3 })).toBe(true);
    expect(isAction({ k: 'play', card: '3' })).toBe(false);
    expect(isAction({ k: 'answer', a: [1, 'x'] })).toBe(false);
    expect(isAction({ k: 'forfeit', reason: 'whatever' })).toBe(false);
    expect(isAction(null)).toBe(false);
  });
});
