import type { Game } from '../engine/game';

/**
 * Every move a player can make, as plain data. Both clients and the server
 * apply the same actions in the same order to a Game built from the same seed,
 * so the engine stays deterministic and nothing but actions crosses the wire.
 */
export type Action =
  | { k: 'play'; card: number } // card instance id from the player's hand
  | { k: 'currency' } // run all currency
  | { k: 'acquire' } // end actions → buy phase
  | { k: 'buy'; pile: string; auto?: boolean } // auto: run currency first if needed
  | { k: 'end' }
  | { k: 'answer'; a: number[] | string | null }
  | { k: 'forfeit'; reason: 'abort' | 'timeout' };

export interface SeatedAction {
  seat: number;
  action: Action;
}

const FORFEIT_TEXT = { abort: 'ABORTED', timeout: 'LINK TIMED OUT' } as const;

/** Shape check for untrusted JSON. Does not check legality — applyAction does. */
export function isAction(x: unknown): x is Action {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  switch (a.k) {
    case 'play': return Number.isInteger(a.card);
    case 'currency': case 'acquire': case 'end': return true;
    case 'buy': return typeof a.pile === 'string' && (a.auto === undefined || typeof a.auto === 'boolean');
    case 'answer':
      return a.a === null || typeof a.a === 'string' || (Array.isArray(a.a) && a.a.length <= 20 && a.a.every(Number.isInteger));
    case 'forfeit': return a.reason === 'abort' || a.reason === 'timeout';
    default: return false;
  }
}

/** Apply `action` for `seat`. Returns false (and changes nothing) if it isn't legal right now. */
export function applyAction(g: Game, seat: number, action: Action): boolean {
  if (g.over || (seat !== 0 && seat !== 1)) return false;
  if (action.k === 'forfeit') {
    g.forfeit(seat, `${g.players[seat].name} ${FORFEIT_TEXT[action.reason]}`);
    return true;
  }
  if (action.k === 'answer') {
    return g.pending?.player === seat && g.answer(action.a);
  }
  if (g.pending || g.current !== seat) return false;
  switch (action.k) {
    case 'play': {
      const card = g.players[seat].hand.find((c) => c.id === action.card);
      return !!card && g.playCard(seat, card);
    }
    case 'currency':
      g.playAllCurrency(seat);
      return true;
    case 'acquire':
      g.toBuyPhase(seat);
      return true;
    case 'buy':
      if (!(action.pile in g.supply)) return false;
      if (action.auto && !g.canBuy(seat, action.pile)) g.playAllCurrency(seat);
      return g.buy(seat, action.pile);
    case 'end':
      g.endTurn(seat);
      return true;
  }
}
