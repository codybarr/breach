# PVE mode: feasibility investigation

Goal: 2-3 people play online, together, against the computer. Today every match is 1v1.

**Verdict: feasible.** The architecture helps more than it gets in the way. The technical work is mostly straightforward; the harder part is making the mode fun and balanced.

Status: based on reading the code at commit `4b0e79b` (November 2026), and line numbers refer to that commit. Nothing has been prototyped, and the design choices below are recommendations that have not been decided.

Later engine work adds more two-player state, such as the `scheduled` tuple in `Game` and new card effects that target the opponent. Search for `1 - ` and two-element tuples again before starting.

## What already works in our favor

- **Deterministic replay.** The server replays every action on its own `Game`, and clients rebuild the game from seed plus actions (`src/net/actions.ts`, `server/lobby.ts`). That model carries over to more players.
- **Prompts name who answers.** `applyAction` checks `g.pending?.player === seat`, and card effects are generators that yield prompts. An attack that makes several players discard in turn fits the existing system.
- **The AI can play any seat.** `new AI(seat, difficulty)` is not tied to seat 1. It can take over for a player who drops, and it can drive headless balance simulations.
- **Server timers are injectable.** `Lobby` takes a `Timers` object, so server-side AI pacing stays testable.

## What has to change

### 1. Engine (small)

About ten places hardcode two players:

- `src/engine/game.ts`: the `players` tuple (77), `names` / `aiFlags` / `scores` tuples (64, 69-70), setup loops (97, 113), first player (115), `1 - p` in `endTurn` (253), `forfeit` (260), `breach` (376), `Ctx.opp` (428) and `Ctx.exploit` (488), the turn counter (402), and `finishByScore` / `finish` (405-416).
- `src/engine/ai.ts`: `1 - this.p` in `actionScore` (73) and `cardValue` (114, 147).
- `src/net/actions.ts`: the seat check in `applyAction` (41).

With a single enemy there is no target picker to build. Human attacks always hit the boss, and boss attacks hit the humans. `Ctx.exploit` becomes a loop over targets, checking each target's Daemons separately.

### 2. Server (medium)

- `Room` in `server/lobby.ts` uses two-element tuples for names, tokens, conns and grace timers, and uses `1 - seat` throughout. These need to become 3-4 seats.
- A match starts the moment a second player joins (`join`). PVE needs a waiting room with an explicit start.
- `MatchStart.names` and the `peerUp` / `peer` messages assume one other player, and the room list needs to show open seats.
- The AI must move from the browser to the server. It uses `Math.random` (`ai.ts:23`), so running it on each client would desync the game. The server should pick its moves and broadcast them as normal seated actions, so clients need no AI code in PVE.
- The pacing logic in `GameScene` (0.55-0.9s per AI step) moves to the server.
- A disconnect currently pauses the match and then forfeits it for everyone. In PVE a timed-out player should be replaced by the AI, or eliminated, without ending the match for the team.

### 3. Game screen (largest, maybe half the work)

`src/scenes/GameScene.ts` is built around `me` and `them`: two panels, two deck and discard areas, and one face-down opponent hand. Phones (the `COMPACT` layout) already push the opponent's piles off-screen.

- Compact teammate panels on desktop and mobile.
- Showing another human's turn: their in-play cards, and who the game is waiting on when a prompt belongs to someone else.
- Turn banners, log colors and the end screen need to handle a team result.
- `LobbyScene` needs a co-op room flow.

## Design problems

- **The current AI would lose badly.** It has 20 integrity and would take attacks from 2-3 players per round. It needs to be a real boss with scaled integrity and stronger attacks.
- **The win condition doesn't translate.** Most of the game is a victory-point race, which means little in co-op.
- **Supply is sized for two decks.** Node, Server and Mainframe have 8 cards each and programs have 10. Three piles will empty much faster with four decks, and the 10 Malware cards will run out quickly if boss attacks hit everyone.
- **Downtime grows with player count.** Attacks that prompt other players help keep people involved during someone else's turn.

## Recommendations and open decisions

| Decision | Recommendation |
| --- | --- |
| Win / loss | Crash the boss to win. If the supply ends the game first, the team loses. |
| Turn order | All humans play, then the boss. Boss attacks hit everyone. Less downtime than the boss going between each human. |
| Boss type | Start with the existing AI plus a scaled-up deck and stats. Write a bespoke boss deck only if that feels flat. |
| When a player crashes | Eliminated while the team fights on. The trade-off is that they sit out the rest of the match. |
| Player count | Build for 2-3. It makes the layout much easier, especially on phones. `TODO.md` currently says 3-4. |

## Suggested order

1. Generalize the engine to N players with a boss.
2. Run AI-versus-boss games with no UI to tune boss integrity, deck and supply sizes. This tells us whether the mode is balanced before the expensive screen work.
3. Update the server: rooms, server-side AI, disconnect handling.
4. Build the game screen and lobby changes.
