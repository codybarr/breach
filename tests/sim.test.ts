import { describe, expect, it } from 'vitest';
import { AI } from '../src/engine/ai';
import { ALL_CARDS, KINGDOM_POOL } from '../src/engine/cards';
import { Game } from '../src/engine/game';

function playOut(g: Game, ais: [AI, AI], maxSteps = 20000) {
  let steps = 0;
  while (!g.over && steps++ < maxSteps) {
    if (g.pending) {
      const ans = ais[g.pending.player].answer(g, g.pending);
      if (!g.answer(ans)) throw new Error(`AI gave illegal answer ${JSON.stringify(ans)} to ${g.pending.title}`);
    } else {
      ais[g.current].step(g);
    }
  }
  return steps;
}

function cardCount(g: Game) {
  return g.allCards(0).length + g.allCards(1).length + g.trash.length +
    Object.values(g.supply).reduce((a, b) => a + b, 0);
}

describe('engine', () => {
  it('has 30 card types', () => {
    expect(ALL_CARDS.length).toBe(30);
    expect(KINGDOM_POOL.length).toBe(23);
  });

  it('AI vs AI games always terminate legally and conserve cards', () => {
    const reasons: Record<string, number> = {};
    const wins = [0, 0, 0];
    for (let seed = 1; seed <= 300; seed++) {
      const g = new Game({ seed, aiFlags: [true, true], names: ['A', 'B'] });
      const before = cardCount(g);
      playOut(g, [new AI(0, 'hard'), new AI(1, seed % 2 ? 'normal' : 'easy')]);
      expect(g.over, `seed ${seed} did not finish`).toBeTruthy();
      expect(cardCount(g)).toBe(before);
      const r = g.over!.reason.includes('CRASH') ? 'crash' : g.over!.reason;
      reasons[r] = (reasons[r] ?? 0) + 1;
      wins[g.over!.winner + 1]++;
    }
    console.log('end reasons', reasons, 'draw/hard/other', wins);
  });

  it('every program can be played without throwing', () => {
    for (const id of KINGDOM_POOL) {
      const others = KINGDOM_POOL.filter((x) => x !== id).slice(0, 9);
      for (let seed = 1; seed <= 20; seed++) {
        const g = new Game({ seed, aiFlags: [true, true], kingdom: [id, ...others] });
        playOut(g, [new AI(0, 'normal'), new AI(1, 'normal')]);
        expect(g.over).toBeTruthy();
      }
    }
  });
});
