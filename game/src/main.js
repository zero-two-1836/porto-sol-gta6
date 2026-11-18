// Porto Sol — Streets of the Sun
// main.js — boot and the one loop. The game moves between title, play, pause,
// the job menu, and the job-complete / failed / busted screens. Input is read
// every frame, the world advances in fixed 1/60 s steps, and the renderer paints
// what is there.
//
// ?seed=N fixes the city and the traffic. ?shot=title|drive|chase|foot (with
// &seed=N) stages that scene instead of running the loop, paints it, and sets
// window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createWorld, STATE_TITLE, STATE_PLAY, STATE_PAUSE, STATE_MENU, STATE_COMPLETE, STATE_FAILED, STATE_BUSTED } from './world.js';
import { createInput, ACTION } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { ensureAudio, toggleMute } from './audio.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const api = createWorld(seed);
const world = api.world;
const renderer = createRenderer(canvas);
// Debug/test handle: lets automated play-tests inspect the live simulation.
window.__porto = api;

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  stageShot(name, api);
  let painted = 0;
  function paint() {
    renderer.draw(world, world.progress > 0 || world.cash !== 250);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = STATE_TITLE;
  let hasSave = api.loadGame();
  let lastMissionIndex = 0;
  let accumulator = 0;
  let last = performance.now();
  world.showHow = false;

  function setScreen(next, message) {
    screen = next;
    world.state = next;
    if (message) announce(message);
  }

  function hitButton(list) {
    const m = input.mouse;
    for (const b of list) {
      if (!b.enabled) continue;
      if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) return b.id;
    }
    return null;
  }

  function handleTitle(actions) {
    if (actions & ACTION.MUTE) { toggleMute(); return; }
    if (input.mouseClicked()) {
      const id = hitButton(renderer.titleButtons());
      if (id === 'continue') { ensureAudio(); api.continueGame(); setScreen(STATE_PLAY, 'Back on the streets of Porto Sol.'); return; }
      if (id === 'new') { ensureAudio(); api.newGame(); setScreen(STATE_PLAY, 'New game. Mara is waiting downtown.'); return; }
      if (id === 'how') { world.showHow = !world.showHow; return; }
    }
    if (actions & (ACTION.ENTER | ACTION.CONFIRM)) {
      ensureAudio();
      if (hasSave) { api.continueGame(); setScreen(STATE_PLAY, 'Back on the streets of Porto Sol.'); }
      else { api.newGame(); setScreen(STATE_PLAY, 'New game. Mara is waiting downtown.'); }
    }
  }

  function handlePlay(actions) {
    if (actions & ACTION.MUTE) { toggleMute(); return; }
    if (actions & ACTION.PAUSE) { setScreen(STATE_PAUSE, 'Paused.'); return; }
    if (actions & ACTION.ENTER) { setScreen(STATE_MENU, "Mara's jobs."); return; }
    if (input.pressed('KeyN')) { /* reserved */ }
  }

  function handlePause(actions) {
    if (actions & ACTION.MUTE) { toggleMute(); return; }
    if (input.mouseClicked()) {
      const id = hitButton(renderer.titleButtons());
      if (id === 'resume') { setScreen(STATE_PLAY, 'Playing.'); return; }
      if (id === 'quit') { setScreen(STATE_TITLE, 'Porto Sol.'); return; }
    }
    if (actions & (ACTION.PAUSE | ACTION.ENTER | ACTION.CONFIRM)) setScreen(STATE_PLAY, 'Playing.');
  }

  function handleMenu(actions) {
    if (actions & ACTION.MUTE) { toggleMute(); return; }
    if (actions & ACTION.PAUSE) { setScreen(STATE_PLAY, 'Playing.'); return; }
    const n = input.numberPressed();
    if (n >= 1 && n <= 5) {
      if (n <= world.progress + 1) {
        ensureAudio();
        lastMissionIndex = n - 1;
        api.startMission(lastMissionIndex);
        setScreen(STATE_PLAY, 'Job started.');
      }
      return;
    }
    if (input.mouseClicked()) {
      const id = hitButton(renderer.menuButtons());
      if (id && id.startsWith('mission-')) {
        const idx = Number(id.split('-')[1]);
        if (idx <= world.progress) {
          ensureAudio();
          lastMissionIndex = idx;
          api.startMission(idx);
          setScreen(STATE_PLAY, 'Job started.');
        }
      }
    }
  }

  function handleEnd(actions) {
    if (actions & ACTION.MUTE) { toggleMute(); return; }
    if (input.mouseClicked()) {
      const id = hitButton(renderer.titleButtons());
      if (id === 'resume') { setScreen(STATE_PLAY, 'Playing.'); return; }
      if (id === 'retry') {
        ensureAudio();
        api.startMission(lastMissionIndex);
        setScreen(STATE_PLAY, 'Job restarted.');
        return;
      }
    }
    if (actions & (ACTION.ENTER | ACTION.CONFIRM)) {
      ensureAudio();
      if (screen === STATE_FAILED) {
        api.startMission(lastMissionIndex);
        setScreen(STATE_PLAY, 'Job restarted.');
      } else {
        setScreen(STATE_PLAY, 'Playing.');
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & (ACTION.ENTER | ACTION.CONFIRM | ACTION.PAUSE)) ensureAudio();
    if (screen === STATE_TITLE) handleTitle(actions);
    else if (screen === STATE_PLAY) handlePlay(actions);
    else if (screen === STATE_PAUSE) handlePause(actions);
    else if (screen === STATE_MENU) handleMenu(actions);
    else handleEnd(actions); // complete / failed / busted
    // The world can change the screen itself (busted, job done, job failed).
    if (world.state !== screen) screen = world.state;
  }

  function step() {
    if (screen === STATE_PLAY) {
      world.viewW = renderer.viewW;
      world.viewH = renderer.viewH;
      api.update(STEP, input);
      if (world.state !== screen) screen = world.state;
    } else if (screen === STATE_TITLE) {
      world.viewW = renderer.viewW;
      world.viewH = renderer.viewH;
      api.update(STEP, input);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === STATE_TITLE || screen === STATE_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== STATE_TITLE && screen !== STATE_PLAY) accumulator = 0;
    renderer.draw(world, hasSave);
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === STATE_PLAY) setScreen(STATE_PAUSE, 'Paused.');
  });

  announce('Porto Sol. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
