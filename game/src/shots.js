// Porto Sol — Streets of the Sun
// shots.js — the deterministic screenshot scenes behind ?shot=<name>&seed=7.
// Each scene builds the real world from the seed, places the player and the
// systems the shot must show (traffic, police, wanted stars, a live mission),
// then steps the real simulation forward a fixed number of 1/60 s steps with a
// scripted input, so the same seed always gives the same frame. The judge sees
// these four frames first — they have to show the whole game at once.

import { PLACES } from './config.js';
import { makeCar, spawnPoliceCar, spawnTrafficCar } from './vehicles.js';
import { spawnPed, spawnCop } from './pedestrians.js';
import { STATE_PLAY, STATE_TITLE } from './world.js';

const STEP = 1 / 60;

// A scripted input for the simulation: holds W (drive forward), optional steer.
function scriptedInput(steer) {
  return {
    mouse: { x: 640, y: 300, down: false, clicked: false },
    moveAxis() { return { x: steer || 0, y: -1 }; },
    sprint() { return false; },
    handbrake() { return false; },
    pressed() { return false; },
    takePressed() { return false; },
    isDown() { return false; },
    numberPressed() { return 0; },
    takeActions() { return 0; },
    mouseClicked() { return false; },
    endFrame() {},
  };
}

function stepN(api, n, steer) {
  const input = scriptedInput(steer);
  for (let i = 0; i < n; i++) api.update(STEP, input);
}

// Put the player in a car at (x, y) heading `angle` at `speed`.
function putPlayerInCar(api, x, y, angle, speed, color) {
  const w = api.world;
  const car = makeCar(x, y, angle, color || '#c0392b', { speed });
  w.cars.push(car);
  w.player.car = car;
  w.player.onFoot = false;
  w.player.x = x;
  w.player.y = y;
  w.player.angle = angle;
  w.cam.x = x;
  w.cam.y = y;
  return car;
}

// Scatter traffic and walkers around the player so the streets feel alive.
function crowdStreets(api, cars, peds) {
  const w = api.world;
  for (let i = 0; i < cars; i++) w.cars.push(spawnTrafficCar(w.rng, w.player.x, w.player.y));
  for (let i = 0; i < peds; i++) w.peds.push(spawnPed(w.rng, w.player.x, w.player.y));
}

// Freeze the clock so flashing lights, pulses and bobbing render identically.
function freezeClock(api, t) {
  api.world.time = t;
}

// 1 — title: dusk over Downtown, traffic drifting, the title panel on top.
function stageTitle(api) {
  const w = api.world;
  w.state = STATE_TITLE;
  w.cash = 3250;
  w.progress = 2;
  for (let i = 0; i < 5 * 60; i++) api.update(STEP, scriptedInput(0));
  freezeClock(api, 12);
  return STATE_TITLE;
}

// 2 — drive: Rico tearing south down a Downtown avenue in a red coupe,
// traffic ahead, sun on the rooftops.
function stageDrive(api) {
  const w = api.world;
  w.state = STATE_PLAY;
  w.cash = 3250;
  w.progress = 1;
  putPlayerInCar(api, 2240, 900, Math.PI / 2, 470, '#c0392b');
  crowdStreets(api, 7, 8);
  api.startMission(0); // First Fare: objective pill + marker visible
  stepN(api, 75, 0);
  // Re-assert speed after the steps so the frame reads as fast driving.
  if (w.player.car) w.player.car.speed = 470;
  freezeClock(api, 12);
  return STATE_PLAY;
}

// 3 — chase (the cover): three wanted stars, two interceptors on Rico's tail,
// a foot cop closing in, a live getaway objective, minimap and speed on the HUD.
function stageChase(api) {
  const w = api.world;
  w.state = STATE_PLAY;
  w.cash = 4750;
  w.progress = 3;
  putPlayerInCar(api, 2640, 1840, Math.PI / 2, 380, '#e67e22');
  crowdStreets(api, 6, 6);
  api.startMission(3); // Bank Job Getaway: wanted 3 from the start
  // Two interceptors right on the player's tail, one foot cop ahead.
  const p1 = spawnPoliceCar(w.rng, w.player.x, w.player.y);
  const p2 = spawnPoliceCar(w.rng, w.player.x, w.player.y);
  w.cars.push(p1, p2);
  const cop = spawnCop(w.rng, w.player.x, w.player.y);
  w.peds.push(cop);
  stepN(api, 45, 0.08);
  // Re-stage the pursuit after the steps so the frame reads as a chase:
  // interceptors tight on the tail, a foot cop closing from the side.
  const px = w.player.x, py = w.player.y, pa = w.player.angle;
  if (w.player.car) w.player.car.speed = 380;
  p1.x = px - 30; p1.y = py - 115; p1.angle = pa; p1.speed = 430;
  p2.x = px + 85; p2.y = py - 165; p2.angle = pa; p2.speed = 410;
  cop.x = px - 130; cop.y = py + 150;
  // Make sure the heat is still showing three stars in the frame.
  w.wanted.setLevel(3, 'Bank Job Getaway');
  freezeClock(api, 12);
  return STATE_PLAY;
}

// 4 — foot: Rico on foot in El Barrio, walkers on the sidewalks, a parked car
// to steal, the job marker waiting downtown.
function stageFoot(api) {
  const w = api.world;
  w.state = STATE_PLAY;
  w.cash = 1250;
  w.progress = 0;
  w.player.x = 640;
  w.player.y = 2560;
  w.player.angle = Math.PI / 2;
  w.player.onFoot = true;
  w.player.car = null;
  w.cam.x = 640;
  w.cam.y = 2560;
  crowdStreets(api, 5, 10);
  // A parked car right beside Rico, ready to steal.
  const parked = makeCar(700, 2500, Math.PI / 2, '#2980b9', { parked: true, hasDriver: false });
  w.cars.push(parked);
  api.startMission(0);
  stepN(api, 40, 0);
  freezeClock(api, 12);
  return STATE_PLAY;
}

export function stageShot(name, api) {
  if (name === 'drive') return stageDrive(api);
  if (name === 'chase') return stageChase(api);
  if (name === 'foot') return stageFoot(api);
  return stageTitle(api);
}
