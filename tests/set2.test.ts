import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';

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

describe('new Daemons', () => {
  it('Firewall still blocks and Honeypot still burns the attacker', () => {
    const g = table();
    give(g, 1, 'firewall');
    g.playCard(0, give(g, 0, 'ddos'));
    expect(g.players[1].integrity).toBe(20);

    const h = table();
    give(h, 1, 'honeypot');
    h.playCard(0, give(h, 0, 'ddos'));
    expect(h.players[1].integrity).toBe(20);
    expect(h.players[0].integrity).toBe(18);
  });

  it('2FA is spent when it blocks', () => {
    const g = table();
    const code = give(g, 1, 'twofactor');
    g.playCard(0, give(g, 0, 'ddos'));
    expect(g.players[1].integrity).toBe(20);
    expect(g.players[1].hand).not.toContain(code);
    expect(g.players[1].discard).toContain(code);
  });

  it('a Daemon that stays in hand answers before 2FA', () => {
    const g = table();
    const code = give(g, 1, 'twofactor');
    give(g, 1, 'firewall');
    g.playCard(0, give(g, 0, 'ddos'));
    expect(g.players[1].hand).toContain(code);
  });

  it('CAPTCHA makes the attacker discard', () => {
    const g = table();
    give(g, 1, 'captcha');
    give(g, 0, 'megabyte');
    give(g, 0, 'gigabyte');
    g.playCard(0, give(g, 0, 'ddos'));
    expect(g.pending?.player).toBe(0);
    expect(g.answer([0])).toBe(true);
    expect(g.players[0].hand).toHaveLength(1);
  });

  it('VPN softens Breach without blocking the rest of the Exploit', () => {
    const g = table();
    give(g, 1, 'vpn');
    g.playCard(0, give(g, 0, 'ddos'));
    expect(g.players[1].integrity).toBe(19);
  });

  it('Watchdog draws 2 after a hit but does not block', () => {
    const g = table();
    give(g, 1, 'watchdog');
    g.playCard(0, give(g, 0, 'ddos'));
    expect(g.players[1].integrity).toBe(17);
    expect(g.players[1].hand).toHaveLength(3);
  });

  it('Tripwire hands the attacker a Malware, Sandbox copies the Exploit', () => {
    const g = table();
    give(g, 1, 'tripwire');
    g.playCard(0, give(g, 0, 'ddos'));
    expect(g.players[0].discard.some((c) => c.def === 'malware')).toBe(true);

    const h = table('ddos');
    give(h, 1, 'sandbox');
    h.playCard(0, give(h, 0, 'ddos'));
    expect(h.players[1].discard.some((c) => c.def === 'ddos')).toBe(true);
  });

  it("Air Gap shields, and no card can reopen buying that turn", () => {
    const g = table();
    g.players[0].cycles = 2;
    g.playCard(0, give(g, 0, 'airgap'));
    g.playCard(0, give(g, 0, 'phishing'));
    expect(g.players[0].shield).toBe(6);
    expect(g.canBuy(0, 'megabyte')).toBe(false);
  });
});

describe('new Exploits', () => {
  it('Brute Force ignores Shield', () => {
    const g = table();
    g.players[1].shield = 5;
    g.playCard(0, give(g, 0, 'bruteforce'));
    expect(g.players[1].integrity).toBe(18);
    expect(g.players[1].shield).toBe(5);
  });

  it('Social Engineering goes through a Firewall', () => {
    const g = table();
    give(g, 1, 'firewall');
    g.playCard(0, give(g, 0, 'socialengineering'));
    expect(g.players[1].integrity).toBe(18);
  });

  it('Logic Bomb fires on the attacker\'s next turn', () => {
    const g = table();
    g.playCard(0, give(g, 0, 'logicbomb'));
    expect(g.players[1].integrity).toBe(20);
    g.endTurn(0);
    expect(g.players[1].integrity).toBe(20);
    g.endTurn(1);
    expect(g.players[1].integrity).toBe(16);
  });

  it('Ransomware takes 2 cards, or 4 Integrity on refusal', () => {
    const g = table();
    give(g, 1, 'megabyte');
    give(g, 1, 'megabyte');
    give(g, 1, 'megabyte');
    g.playCard(0, give(g, 0, 'ransomware'));
    expect(g.pending?.player).toBe(1);
    g.answer([0, 1]);
    expect(g.players[1].hand).toHaveLength(1);
    expect(g.players[1].integrity).toBe(20);

    const h = table();
    give(h, 1, 'megabyte');
    give(h, 1, 'megabyte');
    h.playCard(0, give(h, 0, 'ransomware'));
    h.answer([]);
    expect(h.players[1].hand).toHaveLength(2);
    expect(h.players[1].integrity).toBe(16);
  });

  it('SQL Injection trashes the top of the deck', () => {
    const g = table();
    const top = g.players[1].deck[g.players[1].deck.length - 1];
    g.playCard(0, give(g, 0, 'sqlinjection'));
    expect(g.trash).toContain(top);
  });

  it('Man-in-the-Middle steals only Currency', () => {
    const g = table();
    const victim = g.players[1];
    victim.deck.push({ id: 9001, def: 'terabyte' });
    g.playCard(0, give(g, 0, 'mitm'));
    expect(g.trash.some((c) => c.id === 9001)).toBe(true);
    expect(g.players[0].discard.some((c) => c.def === 'terabyte')).toBe(true);

    const h = table();
    h.players[1].deck.push({ id: 9002, def: 'node' });
    h.playCard(0, give(h, 0, 'mitm'));
    expect(h.players[1].deck.some((c) => c.id === 9002)).toBe(true);
  });
});

describe('new Programs', () => {
  it('Exit Scam cashes out a Data card for its cost', () => {
    const g = table();
    give(g, 0, 'server');
    g.playCard(0, give(g, 0, 'exitscam'));
    expect(g.players[0].bandwidth).toBe(2);
    expect(g.answer([0])).toBe(true);
    expect(g.players[0].credits).toBe(5);
    expect(g.trash.some((c) => c.def === 'server')).toBe(true);
  });

  it('Cloud Compute draws one per Program in play, including itself', () => {
    const g = table();
    g.players[0].cycles = 2;
    g.playCard(0, give(g, 0, 'gitstash'));
    g.answer([0]);
    const before = g.players[0].hand.length;
    g.playCard(0, give(g, 0, 'cloudcompute'));
    expect(g.players[0].hand.length).toBe(before + 2);
  });

  it('Cron Job pays out at the start of the next turn', () => {
    const g = table();
    g.playCard(0, give(g, 0, 'cronjob'));
    g.endTurn(0);
    g.endTurn(1);
    expect(g.players[0].credits).toBe(1);
    expect(g.players[0].hand).toHaveLength(6);
  });

  it('Backup can recover a card whose pile is empty', () => {
    const g = table();
    g.supply.mainframe = 0;
    g.players[0].discard = [{ id: 9003, def: 'mainframe' }];
    g.playCard(0, give(g, 0, 'backup'));
    expect(g.answer('mainframe')).toBe(true);
    expect(g.players[0].hand.map((c) => c.id)).toContain(9003);
    expect(g.players[0].discard.some((c) => c.id === 9003)).toBe(false);
  });

  it('Backup cannot pick a card that is not in the discard', () => {
    const g = table();
    g.players[0].discard = [{ id: 9004, def: 'node' }];
    g.playCard(0, give(g, 0, 'backup'));
    expect(g.answer('gigabyte')).toBe(false);
  });

  it('Container runs a Program without gaining it', () => {
    const g = table('phishing');
    g.playCard(0, give(g, 0, 'container'));
    const stock = g.supply.phishing;
    expect(g.answer('phishing')).toBe(true);
    expect(g.supply.phishing).toBe(stock);
    expect(g.players[0].credits).toBe(2);
    expect(g.players[0].discard.some((c) => c.def === 'phishing')).toBe(false);
  });

  it('The Intern trashes itself only when promoted', () => {
    const g = table();
    const intern = give(g, 0, 'intern');
    g.playCard(0, intern);
    g.answer('gigabyte');
    expect(g.trash).toContain(intern);
    expect(g.players[0].discard.some((c) => c.def === 'gigabyte')).toBe(true);

    const h = table();
    const kept = give(h, 0, 'intern');
    h.playCard(0, kept);
    h.answer(null);
    expect(h.players[0].inPlay).toContain(kept);
  });

  it('Git Stash puts the chosen card on top of the deck', () => {
    const g = table();
    const held = give(g, 0, 'terabyte');
    g.playCard(0, give(g, 0, 'gitstash'));
    expect(g.answer([g.players[0].hand.indexOf(held)])).toBe(true);
    expect(g.players[0].deck[g.players[0].deck.length - 1]).toBe(held);
  });
});
