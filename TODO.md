# TODO

- [x] Add a game timer to the playing screen.
- [x] Allow players to read the rules and view a glossary during the game.
- [x] Don't let players accidentally buy Malware cards
- [ ] Make games persistent (survive refresh / reconnect)
- [ ] Game is too long, suggest ways to make games shorter
- [ ] Tutorial / Walkthrough option on the start screen - showing the user how to play the game
- [ ] Rebalancing? some cards too powerful? - have claude suggest which - examine the game math programmatically
- [ ] When tapping the screen on mobile the whole screen flashes
- [ ] Optimize for mobile screens (possibly a full screen button? install as a PWA?) - try easier things before modifying the layout too much to accomodate.
- [ ] **(research, unfinished)** Rework sfx for a computery / hacker vibe. Current sounds are too "mysterious": 210 ms echo with 0.35 feedback, 1400 Hz lowpass, soft attacks (`src/audio/sfx.ts`). Volume is fine.
  - Round 1: `research/sfx-lab.html` (also published at https://claude.ai/artifact/MGr9Ju3cY19dpMeKWgbux8) auditions TERMINAL (square beeps), DATASTREAM (modem/FM), GLITCH (bitcrush) and HUD (clean sci-fi) against CURRENT. Verdict: none of them landed.
  - Next: pin down what "hacker" means with reference sounds before generating more; then evaluate programmatically (render with OfflineAudioContext via Playwright and check tail length / RT60, attack, spectral centroid, loudness against current).
