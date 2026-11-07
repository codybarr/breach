export const RULES = `OBJECTIVE
  Win by holding the most VP when the game ends — OR crash
  your opponent's INTEGRITY to 0 for an instant win.

YOUR TURN
  1. RUN programs (costs 1 CYCLE each; you start with 1).
  2. Play CURRENCY to earn CR, then ACQUIRE cards from the
     supply (1 BANDWIDTH per acquisition).
  3. End turn: everything is discarded, draw 5 new cards.

RESOURCES
  CYC  cycles — how many programs you can run
  CR   credits — spend on cards
  BW   bandwidth — how many cards you can acquire
  INT  integrity — reach 0 and your system crashes

KEYWORDS
  EXPLOIT  attacks the opponent. BREACH deals INT damage.
  DAEMON   while in your hand, auto-blocks enemy exploits.
  SHIELD   absorbs breach until your next turn.
  TRASH    removes a card from the game for good.

GAME END
  When ROOT ACCESS runs out or any 3 supply piles empty.
  Ties break on remaining integrity.`;

export const GLOSSARY = `CARDS
  PROGRAM   costs 1 cycle to run during the action phase.
  CURRENCY  play to earn credits; does not cost cycles.
  DATA      scores VP from anywhere in your deck.
  MALWARE   worth -1 VP; clogs your deck and cannot run.

RESOURCES
  CYC / CYCLE      each turn starts with 1; runs programs.
  CR / CREDIT     pays a card's supply cost.
  BW / BANDWIDTH  each turn starts with 1; pays for buys.
  INT / INTEGRITY starts at 20; at 0 you lose immediately.
  VP              victory points; highest total wins on
                  supply depletion, then highest INT.

EFFECTS
  EXPLOIT  an attack; a Daemon in hand blocks it.
  BREACH   damage to INT, reduced by available shield.
  SHIELD   absorbs damage; resets at your next turn.
  HEAL     restores INT, up to the starting maximum.
  TRASH    permanently removes a card from your deck.
  DISCARD  moves a card to discard; it can return later.
  GAIN     take a supply card, usually into discard.
  DRAW     take cards from your deck into your hand.
           Shuffle discard into a new deck when needed.`;
