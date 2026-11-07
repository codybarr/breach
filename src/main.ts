import type { Difficulty } from './engine/ai';
import { warmCardTextures } from './render/cardArt';
import { Stage } from './render/stage';
import { GameScene } from './scenes/GameScene';
import { StartScene } from './scenes/StartScene';

async function loadFonts() {
  const fonts = ['16px "Share Tech Mono"', '32px "VT323"'];
  const timeout = new Promise((r) => setTimeout(r, 2500));
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), timeout]);
}

async function boot() {
  await loadFonts();
  warmCardTextures();
  document.getElementById('boot')?.remove();

  const stage = new Stage(document.body);
  let difficulty: Difficulty = 'normal';

  const goMenu = () =>
    stage.setScene(new StartScene(stage, { difficulty, onStart: (d) => { difficulty = d; goGame(); } }));
  const goGame = () =>
    stage.setScene(new GameScene(stage, { difficulty, onExit: goMenu, onRestart: goGame }));

  goMenu();
  stage.start();
  // Debug handle for poking at state from the console.
  (window as unknown as { stage: Stage }).stage = stage;
}

void boot();
