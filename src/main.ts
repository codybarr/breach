import type { Difficulty } from './engine/ai';
import { warmCardTextures } from './render/cardArt';
import { Stage } from './render/stage';
import { NetClient, session } from './net/client';
import { setupMobile } from './mobile';
import type { MatchStart } from './net/protocol';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
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
  setupMobile();
  let difficulty: Difficulty = 'normal';

  const goMenu = () =>
    stage.setScene(new StartScene(stage, { difficulty, onStart: (d) => { difficulty = d; goGame(); }, onLan: goLobby }));
  const goGame = () =>
    stage.setScene(new GameScene(stage, { difficulty, onExit: goMenu, onRestart: goGame }));
  const goLobby = () => stage.setScene(new LobbyScene(stage, { onBack: goMenu, onStart: goNetGame }));
  const goNetGame = (client: NetClient, start: MatchStart) =>
    stage.setScene(new GameScene(stage, { difficulty, onExit: goMenu, onRestart: goGame, onLobby: goLobby, net: { client, start } }));

  goMenu();
  resumeLanMatch(goNetGame);
  stage.start();
  // Debug handle for poking at state from the console.
  (window as unknown as { stage: Stage }).stage = stage;
}

void boot();

/** After a reload mid-match, quietly try to reclaim our seat; stay on the menu if it's gone. */
function resumeLanMatch(onResume: (c: NetClient, m: MatchStart) => void) {
  const s = session.get();
  if (!s) return;
  const client = new NetClient();
  const giveUp = setTimeout(() => client.close(), 4000);
  client.onOpen = () => client.send({ t: 'rejoin', room: s.room, token: s.token });
  client.onMessage = (m) => {
    clearTimeout(giveUp);
    if (m.t === 'start' && m.room === s.room) {
      client.onMessage = client.onOpen = null;
      onResume(client, m);
    } else if (m.t === 'error') {
      session.clear();
      client.close();
    }
  };
}
