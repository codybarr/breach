import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { applyAction } from '../src/net/actions';

/** A game on P0's turn with empty hands, so each test deals exactly what it needs. */
function table(...kingdom: string[]) {
  const g = new Game({ seed: 7, firstPlayer: 0, kingdom });
  for (const p of g.players) { p.discard.push(...p.hand); p.hand = []; }
  return g;
}

function give(g: Game, p: number, id: string) {
  g.supply[id] = (g.supply[id] ?? 0) + 1;
  return g.gainCard(p, id, 'hand')!;
}

let nextId = 9000;
/** Put cards on top of a deck so they are in that player's next hand. */
function stack(g: Game, p: number, ...ids: string[]) {
  for (const def of ids) g.players[p].deck.push({ id: nextId++, def });
}

/** P0 plants a Logic Bomb, then both players pass so it goes off against P1's fresh hand. */
function detonate(g: Game, ...nextHand: string[]) {
  expect(g.playCard(0, give(g, 0, 'logicbomb'))).toBe(true);
  g.endTurn(0);
  stack(g, 1, ...nextHand);
  g.endTurn(1);
}

describe('Logic Bomb against Daemons', () => {
  it('still lands for 4 when the defender holds no Daemon', () => {
    const g = table();
    detonate(g);
    expect(g.players[1].integrity).toBe(16);
  });

  for (const daemon of ['firewall', 'honeypot', 'airgap', 'captcha', 'tripwire', 'sandbox', 'twofactor']) {
    it(`is blocked by ${daemon} held when it goes off`, () => {
      const g = table('logicbomb');
      detonate(g, daemon);
      if (g.pending) expect(g.answer([0])).toBe(true); // CAPTCHA makes the attacker discard
      expect(g.players[1].integrity).toBe(20);
      expect(g.events.some((e) => e.t === 'block' && e.p === 1 && e.by === daemon)).toBe(true);
    });
  }

  it('Honeypot burns the attacker when it blocks the detonation', () => {
    const g = table();
    detonate(g, 'honeypot');
    expect(g.players[0].integrity).toBe(18);
  });

  it('CAPTCHA makes the attacker discard before their turn continues', () => {
    const g = table();
    detonate(g, 'captcha');
    expect(g.pending).toMatchObject({ kind: 'hand', player: 0, purpose: 'discard' });
    expect(g.answer([0])).toBe(true);
    expect(g.players[0].hand).toHaveLength(4);
    expect(g.pending).toBeNull();
  });

  it('2FA is spent blocking the detonation', () => {
    const g = table();
    detonate(g, 'twofactor');
    expect(g.players[1].hand.some((c) => c.def === 'twofactor')).toBe(false);
  });

  it('Sandbox copies the Logic Bomb it blocks', () => {
    const g = table('logicbomb');
    detonate(g, 'sandbox');
    expect(g.players[1].discard.some((c) => c.def === 'logicbomb')).toBe(true);
  });

  it('VPN softens the detonation by 2', () => {
    const g = table();
    detonate(g, 'vpn');
    expect(g.players[1].integrity).toBe(18);
  });

  it('Watchdog draws when the bomb goes off, not when it is planted', () => {
    const g = table();
    give(g, 1, 'watchdog');
    g.playCard(0, give(g, 0, 'logicbomb'));
    expect(g.players[1].hand).toHaveLength(1);
    g.endTurn(0);
    stack(g, 1, 'watchdog');
    g.endTurn(1);
    expect(g.players[1].integrity).toBe(16);
    expect(g.players[1].hand).toHaveLength(7);
  });
});

describe('Backup', () => {
  it('cannot be run with an empty discard, so no Cycle is wasted', () => {
    const g = table();
    g.players[0].discard = [];
    const backup = give(g, 0, 'backup');
    expect(g.canPlay(0, backup)).toBe(false);
    expect(applyAction(g, 0, { k: 'play', card: backup.id })).toBe(false);
    expect(g.players[0].cycles).toBe(1);
    expect(g.players[0].hand).toContain(backup);
  });

  it('offers every card type in the discard and moves the chosen one to hand', () => {
    const g = table('phishing');
    g.players[0].discard = ['megabyte', 'node', 'phishing', 'malware'].map((def, i) => ({ id: 9500 + i, def }));
    const backup = give(g, 0, 'backup');
    expect(applyAction(g, 0, { k: 'play', card: backup.id })).toBe(true);
    const pr = g.pending;
    if (pr?.kind !== 'supply') throw new Error('Backup should ask which card to restore');
    expect(g.piles.filter((id) => g.supplyEligible(pr, id)).sort()).toEqual(['malware', 'megabyte', 'node', 'phishing']);
    expect(applyAction(g, 0, { k: 'answer', a: 'phishing' })).toBe(true);
    expect(g.players[0].hand.map((c) => c.id)).toContain(9502);
    expect(g.players[0].discard.map((c) => c.def).sort()).toEqual(['malware', 'megabyte', 'node']);
    expect(g.pending).toBeNull();
  });
});

describe('Buffer Overflow', () => {
  /** P0 runs Buffer Overflow from a hand of `size` cards (itself included). */
  function overflowFrom(size: number) {
    const g = table();
    const card = give(g, 0, 'bufferoverflow');
    for (let i = 1; i < size; i++) give(g, 0, 'megabyte');
    expect(g.playCard(0, card)).toBe(true);
    return 20 - g.players[1].integrity;
  }

  it('deals 2 from a normal 5-card hand', () => {
    expect(overflowFrom(5)).toBe(2);
  });

  it('deals more the bigger the hand', () => {
    expect(overflowFrom(6)).toBe(3);
    expect(overflowFrom(8)).toBe(5);
  });

  it('deals nothing from a hand too small to overflow', () => {
    expect(overflowFrom(2)).toBe(0);
  });
});
