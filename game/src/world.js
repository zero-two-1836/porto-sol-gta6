// Porto Sol — Streets of the Sun
// world.js — the simulation. One job: hold everything that moves and advance it
// one fixed step at a time — the player on foot or behind the wheel, traffic,
// pedestrians, police, wanted heat, missions, particles and the camera. It knows
// nothing about pixels; the renderer reads this state.

import { WORLD_W, WORLD_H, TUNE, PLACES, MISSION_REWARDS } from './config.js';
import { buildCity, districtAt, districtName, resolveCircleBuildings, onRoad } from './city.js';
import { makeRng } from './rng.js';
import {
  makeCar, drivePlayerCar, updateTraffic, updatePoliceCar,
  spawnTrafficCar, spawnParkedCar, spawnPoliceCar, collideCar, damageCar,
} from './vehicles.js';
import { makePed, spawnPed, spawnCop, updatePed, knockDown } from './pedestrians.js';
import { MISSIONS, createMissionManager } from './missions.js';
import { createWanted } from './wanted.js';
import { sfxShot, sfxPunch, sfxChime, sfxCrash, sfxSteal, sfxBusted, sfxMission, setEngine, setSiren } from './audio.js';

export const STATE_TITLE = 'title';
export const STATE_PLAY = 'play';
export const STATE_PAUSE = 'pause';
export const STATE_MENU = 'menu';
export const STATE_COMPLETE = 'complete';
export const STATE_FAILED = 'failed';
export const STATE_BUSTED = 'busted';

export function createWorld(seed) {
  const city = buildCity(seed);
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  const wanted = createWanted();
  const missions = createMissionManager();

  const player = {
    x: PLACES.maraOffice.x, y: PLACES.maraOffice.y + 90,
    angle: -Math.PI / 2, aimAngle: -Math.PI / 2,
    onFoot: true, car: null,
    punchCd: 0, shootCd: 0,
  };
  const cam = { x: player.x, y: player.y };
  const world = {
    seed, city, rng, wanted, missions,
    player, cam,
    cars: [], peds: [], particles: [],
    cash: 250, // Rico starts with a little pocket money
    progress: 0, // highest mission completed (0 = none)
    state: STATE_TITLE,
    time: 0,
    viewW: 1280, viewH: 720,
    gunshotAt: null,
    toast: '', toastTimer: 0,
    completedMission: null,
    failReason: '',
    bustedLoss: 0,
    dusk: false,
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0 },
  };

  // --- particles ----------------------------------------------------------
  function addParticle(x, y, vx, vy, life, color, size) {
    if (world.particles.length > 240) world.particles.shift();
    world.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
  }
  function burst(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(speed * 0.3, speed);
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rng.range(life * 0.5, life), color, size);
    }
  }

  function toast(text, seconds = 3) {
    world.toast = text;
    world.toastTimer = seconds;
  }

  // --- spawning -----------------------------------------------------------
  function maintainTraffic() {
    let count = 0;
    for (const c of world.cars) if (c.traffic) count++;
    for (let i = count; i < TUNE.trafficMax; i++) {
      const car = spawnTrafficCar(rng, player.x, player.y);
      world.cars.push(car);
    }
    // A few parked cars to steal, near the player.
    let parked = 0;
    for (const c of world.cars) if (c.parked) parked++;
    for (let i = parked; i < 5; i++) {
      const car = spawnParkedCar(rng, player.x, player.y);
      if (car) world.cars.push(car);
    }
  }

  function maintainPeds() {
    let count = 0;
    for (const p of world.peds) if (!p.cop) count++;
    for (let i = count; i < TUNE.pedMax; i++) world.peds.push(spawnPed(rng, player.x, player.y));
  }

  function maintainPolice() {
    const level = wanted.w.level;
    let foot = 0, cars = 0;
    for (const p of world.peds) if (p.cop && !p.down) foot++;
    for (const c of world.cars) if (c.police && !c.wrecked) cars++;
    const wantFoot = level >= 1 ? Math.min(3, level) : 0;
    const wantCars = level >= 2 ? Math.min(4, level - 1) : 0;
    for (let i = foot; i < wantFoot; i++) world.peds.push(spawnCop(rng, player.x, player.y));
    for (let i = cars; i < wantCars; i++) world.cars.push(spawnPoliceCar(rng, player.x, player.y));
  }

  function cullFar() {
    world.cars = world.cars.filter((c) => {
      if (c === player.car) return true;
      if (c.police) return Math.hypot(c.x - player.x, c.y - player.y) < 1800;
      return Math.hypot(c.x - player.x, c.y - player.y) < 1500;
    });
    world.peds = world.peds.filter((p) => {
      if (p.cop) return Math.hypot(p.x - player.x, p.y - player.y) < 1600;
      return Math.hypot(p.x - player.x, p.y - player.y) < 1200;
    });
  }

  // --- crime ---------------------------------------------------------------
  function commitCrime(stars, reason) {
    wanted.addCrime(stars, reason);
    toast(reason + ' — wanted level ' + wanted.w.level, 2.5);
  }

  // --- player actions ------------------------------------------------------
  function nearestCar(maxDist) {
    let best = null, bd = maxDist;
    for (const c of world.cars) {
      if (c.wrecked) continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar(car) {
    if (car.police) {
      commitCrime(2, 'Stole a police interceptor');
    } else if (car.traffic && car.hasDriver) {
      commitCrime(1, 'Grand theft auto');
      // The driver bails and runs.
      const driver = makePed(car.x + 30, car.y, { speed: 200 });
      driver.fleeing = true;
      driver.fleeTimer = 3;
      world.peds.push(driver);
      world.stats.carsStolen += 1;
    } else if (car.parked) {
      world.stats.carsStolen += 1;
    }
    car.traffic = false;
    car.parked = false;
    car.hasDriver = true;
    player.car = car;
    player.onFoot = false;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    sfxSteal();
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    const side = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * 34;
    player.y = car.y + Math.sin(side) * 34;
    const [nx, ny] = resolveCircleBuildings(city, player.x, player.y, 14);
    player.x = nx; player.y = ny;
    player.onFoot = true;
    player.car = null;
    player.angle = car.angle;
    car.speed *= 0.3;
  }

  function punch() {
    if (player.punchCd > 0) return;
    player.punchCd = TUNE.punchCooldown;
    sfxPunch();
    const fx = player.onFoot ? player.x + Math.cos(player.angle) * 40 : player.x;
    const fy = player.onFoot ? player.y + Math.sin(player.angle) * 40 : player.y;
    burst(fx, fy, 5, '#ffffff', 120, 0.25, 3);
    for (const p of world.peds) {
      if (p.down) continue;
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d > TUNE.punchRange) continue;
      const ang = Math.atan2(p.y - player.y, p.x - player.x);
      let diff = ang - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.1) continue;
      knockDown(p, player.x, player.y);
      if (p.cop) commitCrime(2, 'Assaulted an officer');
      else commitCrime(1, 'Assault');
      return;
    }
  }

  function shoot() {
    if (player.shootCd > 0) return;
    player.shootCd = TUNE.shootCooldown;
    world.stats.shotsFired += 1;
    sfxShot();
    const ox = player.x, oy = player.y;
    const aim = player.aimAngle;
    const mx = ox + Math.cos(aim) * 26, my = oy + Math.sin(aim) * 26;
    addParticle(mx, my, Math.cos(aim) * 60, Math.sin(aim) * 60, 0.12, '#ffd76a', 5);
    // Muzzle flash + tracer line (drawn as a short-lived particle streak).
    const tx = ox + Math.cos(aim) * TUNE.shootRange;
    const ty = oy + Math.sin(aim) * TUNE.shootRange;
    addParticle((mx + tx) / 2, (my + ty) / 2, 0, 0, 0.08, '#ffe9a8', 2);
    world.gunshotAt = { x: ox, y: oy };
    commitCrime(1, 'Shots fired');

    // Hitscan: nearest ped or car near the aim line.
    let best = null, bd = TUNE.shootRange, bestKind = '';
    for (const p of world.peds) {
      if (p.down) continue;
      const dx = p.x - ox, dy = p.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > TUNE.shootRange) continue;
      const ang = Math.atan2(dy, dx);
      let diff = ang - aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 0.13 && d < bd) { bd = d; best = p; bestKind = 'ped'; }
    }
    for (const c of world.cars) {
      if (c === player.car || c.wrecked) continue;
      const dx = c.x - ox, dy = c.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > TUNE.shootRange) continue;
      const ang = Math.atan2(dy, dx);
      let diff = ang - aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 0.1 && d < bd) { bd = d; best = c; bestKind = 'car'; }
    }
    if (best) {
      burst(best.x, best.y, 8, '#ff5a4a', 160, 0.4, 3);
      if (bestKind === 'ped') {
        knockDown(best, ox, oy);
        if (best.cop) commitCrime(2, 'Shot a cop');
        else { world.stats.pedsHit += 1; }
      } else {
        damageCar(best, 34);
        if (best.wrecked) burst(best.x, best.y, 16, '#555555', 120, 0.8, 5);
      }
    }
  }

  // --- police behaviour ----------------------------------------------------
  // Police behaviour. Returns whether any cop is close enough to see the
  // player (inside 450 units — that is what blocks the heat from falling)
  // and whether a cop is currently holding the player for a bust.
  // Cops give up: a foot cop cannot take a player in a car, and an
  // interceptor that has not seen the player for 15 s breaks off the chase.
  function updatePolice(dt) {
    let copsNear = false;
    let beingHeld = false;
    const removePeds = [];
    const removeCars = [];
    for (const p of world.peds) {
      if (!p.cop || p.down) continue;
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < 450) copsNear = true;
      if (!player.onFoot) {
        // A foot cop cannot drag Rico out of a car: after a few seconds of
        // standing at the window, he gives up and walks off.
        p.giveUp = (p.giveUp || 0) + dt;
        if (p.giveUp > 6) removePeds.push(p);
        continue;
      }
      p.giveUp = 0;
      // Chase on foot.
      const want = Math.atan2(player.y - p.y, player.x - p.x);
      let diff = want - p.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.angle += Math.max(-4 * dt, Math.min(4 * dt, diff));
      p.x += Math.cos(p.angle) * TUNE.copFootSpeed * dt;
      p.y += Math.sin(p.angle) * TUNE.copFootSpeed * dt;
      if (player.onFoot && d < 34) beingHeld = true;
    }
    for (const c of world.cars) {
      if (!c.police || c.wrecked) continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < 450) copsNear = true;
      if (d > 300) {
        c.giveUp = (c.giveUp || 0) + dt;
        if (c.giveUp > 15) { removeCars.push(c); continue; }
      } else {
        c.giveUp = 0;
      }
      const touching = updatePoliceCar(c, dt, player.x, player.y, city);
      if (touching) {
        // Ram: shove the player's car and damage it; pin a slow player.
        if (!player.onFoot && player.car) {
          damageCar(player.car, 18 * dt);
          const push = Math.atan2(player.y - c.y, player.x - c.x);
          player.car.x += Math.cos(push) * 40 * dt;
          player.car.y += Math.sin(push) * 40 * dt;
          if (Math.abs(player.car.speed) < 80) beingHeld = true;
        } else if (player.onFoot) {
          beingHeld = true;
        }
      }
    }
    if (removePeds.length) world.peds = world.peds.filter((p) => !removePeds.includes(p));
    if (removeCars.length) world.cars = world.cars.filter((c) => !removeCars.includes(c));
    setSiren(copsNear && wanted.w.level > 0);
    return { copsNear, beingHeld };
  }

  function doBusted() {
    const loss = Math.floor(world.cash * 0.2);
    world.bustedLoss = loss;
    world.cash -= loss;
    wanted.clear('Busted');
    if (missions.m.active) {
      missions.abort('Busted by the Porto Sol PD.');
      world.failReason = 'Busted by the Porto Sol PD.';
    }
    if (player.car) { player.car = null; }
    player.onFoot = true;
    player.x = PLACES.hills.x;
    player.y = PLACES.hills.y + 60;
    player.angle = -Math.PI / 2;
    // Clear the heat's enforcers so the player wakes up clean.
    world.peds = world.peds.filter((p) => !p.cop);
    world.cars = world.cars.filter((c) => !c.police);
    sfxBusted();
    setEngine(0, false);
    world.state = STATE_BUSTED;
    saveGame();
  }

  // --- missions ------------------------------------------------------------
  function startMission(index) {
    const mission = MISSIONS[index];
    if (!mission) return;
    const startWanted = missions.start(mission);
    if (startWanted > 0) wanted.setLevel(startWanted, mission.name);
    toast('Job started: ' + mission.name, 3.5);
    world.state = STATE_PLAY;
    saveGame();
  }

  // --- save / load -----------------------------------------------------------
  function saveGame() {
    try {
      window.localStorage.setItem(TUNE.saveKey, JSON.stringify({ cash: world.cash, progress: world.progress }));
    } catch { /* private mode: progress lasts this visit only */ }
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(TUNE.saveKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (typeof data.cash === 'number') world.cash = data.cash;
      if (typeof data.progress === 'number') world.progress = Math.max(0, Math.min(5, data.progress));
      return world.progress > 0 || world.cash !== 250;
    } catch { return false; }
  }

  // --- per-frame update ------------------------------------------------------
  function update(dt, input) {
    world.time += dt;
    if (world.toastTimer > 0) world.toastTimer -= dt;

    if (world.state === STATE_TITLE) {
      // Ambient city behind the title: traffic and peds drift, camera pans.
      stepAmbient(dt);
      cam.x = 2240 + Math.sin(world.time * 0.05) * 700;
      cam.y = 1440 + Math.cos(world.time * 0.04) * 500;
      return;
    }
    if (world.state !== STATE_PLAY) return;

    // Aim: mouse position in world space.
    const aimWorldX = cam.x - world.viewW / 2 + input.mouse.x;
    const aimWorldY = cam.y - world.viewH / 2 + input.mouse.y;
    player.aimAngle = Math.atan2(aimWorldY - player.y, aimWorldX - player.x);
    if (player.onFoot) {
      // Face the mouse when aiming, else face the movement direction.
      if (input.mouse.down || Math.hypot(aimWorldX - player.x, aimWorldY - player.y) > 60) {
        player.angle = player.aimAngle;
      }
    }

    if (player.punchCd > 0) player.punchCd -= dt;
    if (player.shootCd > 0) player.shootCd -= dt;

    // Actions — E and F are consuming presses (see input.js: one physical
    // press must never enter-then-exit a car across two steps in one frame).
    if (input.takePressed('KeyE')) {
      if (player.onFoot) {
        const car = nearestCar(78);
        if (car) enterCar(car);
      } else {
        exitCar();
      }
    }
    if (input.takePressed('KeyF')) punch();
    if (input.mouse.down) shoot();

    const axis = input.moveAxis();
    if (player.onFoot) {
      const speed = input.sprint() ? TUNE.sprintSpeed : TUNE.walkSpeed;
      player.x += axis.x * speed * dt;
      player.y += axis.y * speed * dt;
      if (axis.x !== 0 || axis.y !== 0) {
        if (!input.mouse.down) player.angle = Math.atan2(axis.y, axis.x);
      }
      const [nx, ny] = resolveCircleBuildings(city, player.x, player.y, 14);
      player.x = Math.max(40, Math.min(WORLD_W - 40, nx));
      player.y = Math.max(40, Math.min(WORLD_H - 40, ny));
      setEngine(0, false);
    } else if (player.car) {
      const car = player.car;
      if (car.damageCd > 0) car.damageCd -= dt;
      drivePlayerCar(car, axis, input.handbrake(), dt);
      const hard = collideCar(car, city, world.cars, dt);
      // Blocked nose-first into a wall at crawling speed: scrape around the
      // corner instead of sitting pinned while the player holds W.
      if (car.blocked && Math.abs(car.speed) < 40 && axis.y < 0) car.angle += 1.4 * dt;
      if (hard && car.damageCd <= 0) {
        // One thump per half second, not per frame: barging through traffic
        // at speed should cost paint, not the whole car.
        damageCar(car, 8);
        car.damageCd = 0.6;
        sfxCrash();
        burst(car.x, car.y, 8, '#aaaaaa', 140, 0.5, 4);
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      setEngine(Math.abs(car.speed), true);
      if (car.wrecked) {
        burst(car.x, car.y, 20, '#333333', 100, 1.2, 6);
        toast('Your car is wrecked.', 3);
        exitCar();
      }
      // Running over pedestrians.
      for (const p of world.peds) {
        if (p.down) continue;
        if (Math.hypot(p.x - car.x, p.y - car.y) < 30 && Math.abs(car.speed) > 150) {
          knockDown(p, car.x, car.y);
          world.stats.pedsHit += 1;
          commitCrime(1, 'Hit a pedestrian');
        }
      }
      // Skid particles on handbrake turns.
      if (input.handbrake() && Math.abs(car.speed) > 200 && Math.random() < 0.5) {
        addParticle(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 0, 0, 0.5, '#888888', 4);
      }
    }

    // Traffic + pedestrians.
    for (const c of world.cars) {
      if (c === player.car || c.police) continue;
      if (c.traffic) updateTraffic(c, dt, city, world.cars, rng);
      else if (!c.parked && !c.wrecked) {
        // An abandoned car slowly rolls to a stop.
        c.speed *= Math.max(0, 1 - 2 * dt);
        c.x += Math.cos(c.angle) * c.speed * dt;
        c.y += Math.sin(c.angle) * c.speed * dt;
      }
    }
    for (let i = world.peds.length - 1; i >= 0; i--) {
      const p = world.peds[i];
      if (!updatePed(p, dt, city, rng, { x: player.x, y: player.y, speed: player.onFoot ? 0 : Math.abs(player.car ? player.car.speed : 0), inCar: !player.onFoot }, world.gunshotAt)) {
        world.peds.splice(i, 1);
      }
    }
    world.gunshotAt = null;

    // Wrecked cars smoke.
    for (const c of world.cars) {
      if (c.wrecked && c.smoke > 0) {
        c.smoke -= dt * 0.2;
        if (Math.random() < 0.3) addParticle(c.x, c.y - 6, rng.range(-10, 10), rng.range(-40, -20), 0.9, '#555555', 6);
      }
    }

    // Police + wanted.
    maintainPolice();
    const { copsNear, beingHeld } = updatePolice(dt);
    const busted = wanted.update(dt, copsNear, beingHeld);
    if (busted === 'busted') {
      doBusted();
      return;
    }

    // Missions.
    if (missions.m.active) {
      const result = missions.update(dt, player.x, player.y, (n) => wanted.setLevel(n, 'The Big Score'));
      if (result === 'step') {
        sfxChime();
        toast('Objective updated', 2);
      } else if (result === 'complete') {
        const mission = missions.m.active;
        world.cash += mission.reward;
        world.progress = Math.max(world.progress, mission.id);
        world.completedMission = mission;
        missions.clear();
        wanted.clear('Job done');
        sfxMission();
        saveGame();
        world.state = STATE_COMPLETE;
        setEngine(0, false);
        return;
      } else if (result === 'failed') {
        world.failReason = missions.m.failReason;
        missions.clear();
        world.state = STATE_FAILED;
        setEngine(0, false);
        return;
      }
    }

    // Spawning + cleanup.
    maintainTraffic();
    maintainPeds();
    cullFar();

    // Particles.
    for (let i = world.particles.length - 1; i >= 0; i--) {
      const p = world.particles[i];
      p.life -= dt;
      if (p.life <= 0) { world.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98; p.vy *= 0.98;
    }

    // Camera follows the player, clamped to the city.
    cam.x += (player.x - cam.x) * Math.min(1, 6 * dt);
    cam.y += (player.y - cam.y) * Math.min(1, 6 * dt);
    cam.x = Math.max(world.viewW / 2, Math.min(WORLD_W - world.viewW / 2, cam.x));
    cam.y = Math.max(world.viewH / 2, Math.min(WORLD_H - world.viewH / 2, cam.y));
  }

  // Ambient traffic for the title backdrop (no player, no police, no crimes).
  function stepAmbient(dt) {
    maintainTraffic();
    maintainPeds();
    for (const c of world.cars) {
      if (c.traffic) updateTraffic(c, dt, city, world.cars, rng);
    }
    for (let i = world.peds.length - 1; i >= 0; i--) {
      if (!updatePed(world.peds[i], dt, city, rng, { x: 1e9, y: 1e9, speed: 0, inCar: false }, null)) {
        world.peds.splice(i, 1);
      }
    }
    cullFar();
  }

  function newGame() {
    world.cash = 250;
    world.progress = 0;
    wanted.clear();
    missions.clear();
    world.cars = [];
    world.peds = [];
    world.particles = [];
    player.x = PLACES.maraOffice.x;
    player.y = PLACES.maraOffice.y + 90;
    player.angle = -Math.PI / 2;
    player.onFoot = true;
    player.car = null;
    cam.x = player.x;
    cam.y = player.y;
    maintainTraffic();
    maintainPeds();
    saveGame();
    world.state = STATE_PLAY;
  }

  function continueGame() {
    loadGame();
    world.cars = [];
    world.peds = [];
    world.particles = [];
    wanted.clear();
    missions.clear();
    player.x = PLACES.maraOffice.x;
    player.y = PLACES.maraOffice.y + 90;
    player.angle = -Math.PI / 2;
    player.onFoot = true;
    player.car = null;
    cam.x = player.x;
    cam.y = player.y;
    maintainTraffic();
    maintainPeds();
    world.state = STATE_PLAY;
  }

  return {
    world, player, cam, city, rng, wanted, missions,
    update, newGame, continueGame, startMission, saveGame, loadGame,
    toast, districtAt, districtName,
  };
}
