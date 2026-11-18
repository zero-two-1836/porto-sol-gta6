// Porto Sol — Streets of the Sun
// pedestrians.js — the people on the sidewalks. One job: walk the pavements,
// turn at intersections, and run when trouble comes. Cops on foot are peds too.

import { ROADS_V, ROADS_H, WORLD_W, WORLD_H } from './config.js';
import { nearestRoad } from './city.js';
import { makeRng } from './rng.js';

const SKINS = ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0', '#6b4226'];
const SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1', '#1abc9c'];
const PANTS = ['#2c3e50', '#34495e', '#7f8c8d', '#5d4037', '#1a1a1a'];

let nextId = 1;

export function makePed(x, y, opts = {}) {
  return {
    id: nextId++,
    x, y,
    angle: opts.angle || 0,
    speed: opts.speed || 90,
    walkSpeed: opts.speed || 90,
    skin: opts.skin || SKINS[(nextId * 7) % SKINS.length],
    shirt: opts.shirt || SHIRTS[(nextId * 3) % SHIRTS.length],
    pants: opts.pants || PANTS[(nextId * 5) % PANTS.length],
    axis: opts.axis || 'v',
    dir: opts.dir || 1,
    lane: opts.lane || 0,
    cop: !!opts.cop,
    down: false, // knocked out / dead — fades out
    downTimer: 0,
    fleeing: false,
    fleeTimer: 0,
    turnAt: 0,
  };
}

// A walker on a sidewalk near (cx, cy).
export function spawnPed(rng, cx, cy) {
  const axis = rng.chance(0.5) ? 'v' : 'h';
  const road = axis === 'v' ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
  const dir = rng.chance(0.5) ? 1 : -1;
  const side = rng.chance(0.5) ? 1 : -1;
  const lane = road + side * 52; // sidewalk, just off the road
  const along = axis === 'v' ? cy + rng.range(-700, 700) : cx + rng.range(-700, 700);
  const x = axis === 'v' ? lane : Math.max(100, Math.min(WORLD_W - 100, along));
  const y = axis === 'v' ? Math.max(100, Math.min(WORLD_H - 100, along)) : lane;
  const angle = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  return makePed(x, y, { axis, dir, lane, angle, speed: rng.range(70, 120) });
}

// A foot cop, spawned 550–800 units from the player (outside the 450-unit
// "seen" radius, so a fresh cop never blocks the heat from falling) and snapped
// onto the nearest road's sidewalk.
export function spawnCop(rng, cx, cy) {
  const angle = rng.range(0, Math.PI * 2);
  const dist = rng.range(550, 800);
  let x = cx + Math.cos(angle) * dist;
  let y = cy + Math.sin(angle) * dist;
  const road = nearestRoad(x, y);
  if (road.axis === 'v') { x = road.at + rng.pick([-52, 52]); }
  else { y = road.at + rng.pick([-52, 52]); }
  x = Math.max(100, Math.min(WORLD_W - 100, x));
  y = Math.max(100, Math.min(WORLD_H - 100, y));
  return makePed(x, y, { cop: true, speed: 265, walkSpeed: 265, shirt: '#1c2733', pants: '#1c2733', skin: '#e8b98a' });
}

// One step for one pedestrian.
// player: {x, y, speed, inCar} — peds flee a fast car or a gunshot nearby.
export function updatePed(ped, dt, city, rng, player, gunshotAt) {
  if (ped.down) {
    ped.downTimer -= dt;
    return ped.downTimer > 0; // false when it is time to remove
  }
  if (ped.cop) return true; // cops are steered by the wanted system, not here

  // Flee: a speeding car close by, or a gunshot nearby.
  const pdx = player.x - ped.x, pdy = player.y - ped.y;
  const pd = Math.hypot(pdx, pdy);
  if ((player.inCar && Math.abs(player.speed) > 180 && pd < 170) || (gunshotAt && Math.hypot(gunshotAt.x - ped.x, gunshotAt.y - ped.y) < 320)) {
    ped.fleeing = true;
    ped.fleeTimer = 1.6;
  }
  if (ped.fleeing) {
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0) ped.fleeing = false;
    // Run directly away from the player.
    const away = Math.atan2(ped.y - player.y, ped.x - player.x);
    ped.angle = away;
    ped.x += Math.cos(away) * 260 * dt;
    ped.y += Math.sin(away) * 260 * dt;
    ped.x = Math.max(60, Math.min(WORLD_W - 60, ped.x));
    ped.y = Math.max(60, Math.min(WORLD_H - 60, ped.y));
    return true;
  }

  const speed = ped.walkSpeed;
  const wantAngle = ped.axis === 'v' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
  let diff = wantAngle - ped.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ped.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  if (ped.axis === 'v') ped.x += (ped.lane - ped.x) * Math.min(1, 3 * dt);
  else ped.y += (ped.lane - ped.y) * Math.min(1, 3 * dt);

  // Turn at an intersection sometimes.
  const nearV = ROADS_V.find((rx) => Math.abs(ped.x - rx) < 24);
  const nearH = ROADS_H.find((ry) => Math.abs(ped.y - ry) < 24);
  if (nearV !== undefined && nearH !== undefined && ped.turnAt !== nearV + nearH * 10000) {
    ped.turnAt = nearV + nearH * 10000;
    if (rng.chance(0.35)) {
      if (ped.axis === 'v') {
        ped.axis = 'h';
        ped.dir = rng.chance(0.5) ? 1 : -1;
        ped.lane = nearH + (ped.dir > 0 ? 52 : -52);
      } else {
        ped.axis = 'v';
        ped.dir = rng.chance(0.5) ? 1 : -1;
        ped.lane = nearV + (ped.dir > 0 ? -52 : 52);
      }
    }
  }
  if (ped.x < 60 || ped.x > WORLD_W - 60 || ped.y < 60 || ped.y > WORLD_H - 60) return false;
  return true;
}

// Knock a pedestrian down (punch or bullet). Returns nothing; the world counts the crime.
export function knockDown(ped, fromX, fromY) {
  ped.down = true;
  ped.downTimer = 4;
  const away = Math.atan2(ped.y - fromY, ped.x - fromX);
  ped.x += Math.cos(away) * 14;
  ped.y += Math.sin(away) * 14;
}

export { makeRng };
