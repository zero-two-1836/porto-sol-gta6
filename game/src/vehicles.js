// Porto Sol — Streets of the Sun
// vehicles.js — car physics, traffic AI and police AI. One job: everything with
// four wheels. The player car is arcade physics (accel, steering, handbrake
// drift); traffic follows the street grid; police hunt the player.

import { WORLD_W, WORLD_H, ROADS_V, ROADS_H, TUNE, CAR_COLORS, POLICE_COLOR } from './config.js';
import { resolveCircleBuildings, hitsBuilding, nearestRoad, onRoad } from './city.js';
import { makeRng } from './rng.js';

export const CAR_LEN = 46; // world units, nose to tail
export const CAR_WID = 22;

let nextId = 1;

export function makeCar(x, y, angle, color, opts = {}) {
  return {
    id: nextId++,
    x, y, angle, speed: opts.speed || 0,
    color: color || '#c0392b',
    police: !!opts.police,
    traffic: !!opts.traffic,
    parked: !!opts.parked,
    hasDriver: opts.hasDriver !== false,
    health: 100,
    wrecked: false,
    // Traffic AI state: which road it follows and which way.
    axis: opts.axis || 'v',
    dir: opts.dir || 1,
    lane: opts.lane || 0,
    turnAt: 0, // intersection centre it will consider turning at
    stuck: 0,
    smoke: 0,
  };
}

// --- Player driving -------------------------------------------------------
// axis: {x, y} from WASD (y = -1 forward), handbrake: Space.
export function drivePlayerCar(car, axis, handbrake, dt) {
  if (car.wrecked) { car.speed *= Math.max(0, 1 - 3 * dt); return; }
  const forward = axis.y < 0 ? 1 : axis.y > 0 ? -1 : 0;
  if (forward > 0) car.speed += TUNE.carAccel * dt;
  else if (forward < 0) {
    if (car.speed > 20) car.speed -= TUNE.carBrake * dt; // brake while moving forward
    else car.speed -= TUNE.carReverseAccel * dt; // then reverse
  }
  // Drag + rolling resistance.
  car.speed -= car.speed * TUNE.carDrag * dt;
  if (Math.abs(car.speed) < 4 && forward === 0) car.speed = 0;
  car.speed = Math.max(-220, Math.min(TUNE.carMaxSpeed, car.speed));

  // Steering: sharper at low speed, looser at high speed; handbrake kills grip.
  const steerInput = axis.x;
  const grip = handbrake ? TUNE.handbrakeGrip : 1;
  const steerRate = 2.4 * grip * Math.max(0.35, 1 - Math.abs(car.speed) / 1400);
  car.angle += steerInput * steerRate * (car.speed / TUNE.carMaxSpeed) * dt * 2.2;
  if (handbrake && Math.abs(car.speed) > 120) car.speed *= Math.max(0, 1 - 1.6 * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

// --- Traffic --------------------------------------------------------------
// A traffic car cruises its road at trafficSpeed, turns at intersections
// sometimes, and brakes for the car ahead. Deterministic: decisions use rng.
export function updateTraffic(car, dt, city, cars, rng) {
  if (car.wrecked) return;
  const target = TUNE.trafficSpeed * (0.85 + (car.id % 5) * 0.06);
  // Car ahead on the same road and lane? Brake.
  let ahead = Infinity;
  for (const other of cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const along = car.axis === 'v' ? dy * car.dir : dx * car.dir;
    const side = car.axis === 'v' ? Math.abs(dx) : Math.abs(dy);
    if (along > 0 && along < 110 && side < 26) ahead = Math.min(ahead, along);
  }
  if (ahead < 90) car.speed = Math.max(0, car.speed - 500 * dt);
  else car.speed += Math.sign(target - car.speed) * 300 * dt;
  car.speed = Math.max(0, Math.min(target, car.speed));
  // Stuck behind a stopped car for over a second? Change lanes and pass.
  if (ahead < 90) car.stuck = (car.stuck || 0) + dt;
  else car.stuck = 0;
  if (car.stuck > 1.2 && car.roadAt !== undefined) {
    car.lane = car.roadAt + (car.lane >= car.roadAt ? -14 : 14);
    car.stuck = 0;
  }

  // Steer toward the centre of the lane on its road.
  const road = car.axis === 'v' ? car.lane : car.lane;
  const wantAngle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Keep on the lane: nudge the off-axis coordinate back to the lane line.
  if (car.axis === 'v') car.x += (road - car.x) * Math.min(1, 2.5 * dt);
  else car.y += (road - car.y) * Math.min(1, 2.5 * dt);

  // At an intersection, sometimes turn onto the crossing road.
  const nearV = ROADS_V.find((rx) => Math.abs(car.x - rx) < 26);
  const nearH = ROADS_H.find((ry) => Math.abs(car.y - ry) < 26);
  if (nearV !== undefined && nearH !== undefined && car.turnAt !== nearV + nearH * 10000) {
    car.turnAt = nearV + nearH * 10000;
    if (rng.chance(0.3)) {
      if (car.axis === 'v') {
        car.axis = 'h';
        car.dir = rng.chance(0.5) ? 1 : -1;
        car.lane = nearH + (car.dir > 0 ? 14 : -14);
        car.angle = car.dir > 0 ? 0 : Math.PI;
      } else {
        car.axis = 'v';
        car.dir = rng.chance(0.5) ? 1 : -1;
        car.lane = nearV + (car.dir > 0 ? -14 : 14);
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }

  // Wrap around the world edge so traffic never runs out.
  if (car.x < 80) { car.x = WORLD_W - 100; }
  if (car.x > WORLD_W - 80) { car.x = 100; }
  if (car.y < 80) { car.y = WORLD_H - 100; }
  if (car.y > WORLD_H - 80) { car.y = 100; }
}

// --- Police cars ----------------------------------------------------------
// Chase the player: steer at them, ram them. Returns true when in contact.
export function updatePoliceCar(car, dt, tx, ty, city) {
  if (car.wrecked) return false;
  const dx = tx - car.x, dy = ty - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  const target = dist > 700 ? TUNE.copCarSpeed : TUNE.copCarSpeed * 0.85;
  car.speed += Math.sign(target - car.speed) * 520 * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Police can clip a building corner while cutting across blocks; shove them out.
  const [nx, ny] = resolveCircleBuildings(city, car.x, car.y, 20);
  if (nx !== car.x || ny !== car.y) { car.x = nx; car.y = ny; car.speed *= 0.6; }
  return dist < 52;
}

// --- Spawning -------------------------------------------------------------
// Pick a road point near (cx, cy) but at least minDist away, on a road.
export function spawnPointNear(rng, cx, cy, minDist, maxDist) {
  for (let tries = 0; tries < 12; tries++) {
    const road = nearestRoad(cx + rng.range(-maxDist, maxDist), cy + rng.range(-maxDist, maxDist));
    let x, y;
    if (road.axis === 'v') { x = road.at + rng.pick([-14, 14]); y = cy + rng.range(-maxDist, maxDist); }
    else { y = road.at + rng.pick([-14, 14]); x = cx + rng.range(-maxDist, maxDist); }
    x = Math.max(120, Math.min(WORLD_W - 120, x));
    y = Math.max(120, Math.min(WORLD_H - 120, y));
    if (Math.hypot(x - cx, y - cy) >= minDist) return { x, y };
  }
  return { x: Math.max(120, cx + minDist), y: cy };
}

// A traffic car on a random road near the player.
export function spawnTrafficCar(rng, cx, cy) {
  const axis = rng.chance(0.5) ? 'v' : 'h';
  const road = axis === 'v' ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
  const dir = rng.chance(0.5) ? 1 : -1;
  const along = axis === 'v' ? cy + rng.range(-900, 900) : cx + rng.range(-900, 900);
  const lane = road + (axis === 'v' ? (dir > 0 ? -14 : 14) : (dir > 0 ? 14 : -14));
  const x = axis === 'v' ? lane : Math.max(120, Math.min(WORLD_W - 120, along));
  const y = axis === 'v' ? Math.max(120, Math.min(WORLD_H - 120, along)) : lane;
  const angle = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  const car = makeCar(x, y, angle, rng.pick(CAR_COLORS), { traffic: true, axis, dir, lane, roadAt: road, speed: TUNE.trafficSpeed });
  return car;
}

// A parked car on a roadside near the player (stealable, no driver, no heat).
// It parks clear of intersections — a car parked on a corner would block the
// crossing road's lane and jam traffic behind it.
export function spawnParkedCar(rng, cx, cy) {
  for (let tries = 0; tries < 6; tries++) {
    const p = spawnPointNear(rng, cx, cy, 200, 700);
    const road = nearestRoad(p.x, p.y);
    const angle = road.axis === 'v' ? Math.PI / 2 : 0;
    // Keep clear of the crossing roads: at least 90 from any intersection.
    let clear = true;
    if (road.axis === 'v') {
      for (const ry of ROADS_H) if (Math.abs(p.y - ry) < 90) { clear = false; break; }
    } else {
      for (const rx of ROADS_V) if (Math.abs(p.x - rx) < 90) { clear = false; break; }
    }
    if (!clear) continue;
    // Park on the sidewalk edge (50 off the centreline), clear of the driving lanes.
    const off = 50;
    const x = road.axis === 'v' ? p.x + off : p.x;
    const y = road.axis === 'v' ? p.y : p.y + off;
    if (hitsBuilding({ byBlock: new Map(), buildings: [] }, x, y, 24)) return null;
    return makeCar(x, y, angle, rng.pick(CAR_COLORS), { parked: true, hasDriver: false });
  }
  return null;
}

// An interceptor police car, spawned on a road some distance from the player.
export function spawnPoliceCar(rng, cx, cy) {
  const p = spawnPointNear(rng, cx, cy, 500, 900);
  const car = makeCar(p.x, p.y, Math.atan2(cy - p.y, cx - p.x), POLICE_COLOR, { police: true, speed: 200 });
  return car;
}

// --- Collisions -----------------------------------------------------------
// Keep cars out of buildings and apart from each other. Returns true if this
// car hit something hard (used for damage + crash sound).
export function collideCar(car, city, cars, dt) {
  let hard = false;
  car.blocked = false; // set when a building shoves the car this step
  const [nx, ny] = resolveCircleBuildings(city, car.x, car.y, 20);
  if (nx !== car.x || ny !== car.y) {
    if (Math.abs(car.speed) > 260) hard = true;
    car.blocked = true;
    // Wall slide: deflect the heading along the wall instead of pinning the
    // car nose-first into the building, so a stolen car mid-turn can escape.
    const px = nx - car.x, py = ny - car.y;
    const pl = Math.hypot(px, py);
    if (pl > 0.5) {
      const nxv = px / pl, nyv = py / pl; // wall normal, pointing out of the building
      const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      const dot = fx * nxv + fy * nyv;
      if (dot < 0) {
        const tx = fx - nxv * dot * 1.4, ty = fy - nyv * dot * 1.4;
        const tl = Math.hypot(tx, ty);
        if (tl > 0.05) car.angle = Math.atan2(ty / tl, tx / tl);
      }
    }
    car.x = nx; car.y = ny;
    car.speed *= 0.55;
  }
  car.x = Math.max(40, Math.min(WORLD_W - 40, car.x));
  car.y = Math.max(40, Math.min(WORLD_H - 40, car.y));
  // Car-to-car: an oriented-box test in this car's local frame (cars are
  // 46 long, 22 wide). Opposite lanes are 28 units apart, so a plain circle
  // test would sideswipe every oncoming car — the across-axis test fixes that.
  const ca = Math.cos(car.angle), sa = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const lx = dx * ca + dy * sa; // along this car's nose
    const ly = -dx * sa + dy * ca; // across this car's body
    if (Math.abs(lx) >= 42 || Math.abs(ly) >= 20) continue;
    const px = 42 - Math.abs(lx), py = 20 - Math.abs(ly);
    let pushX, pushY;
    if (px < py) { pushX = Math.sign(lx || 1) * px; pushY = 0; }
    else { pushX = 0; pushY = Math.sign(ly || 1) * py; }
    // Back to world coordinates, split the push between both cars.
    const wx = pushX * ca - pushY * sa, wy = pushX * sa + pushY * ca;
    car.x -= wx / 2; car.y -= wy / 2;
    other.x += wx / 2; other.y += wy / 2;
    if (Math.abs(car.speed) > 200 || Math.abs(other.speed) > 200) hard = true;
    if (other.traffic) {
      // Shove traffic aside instead of getting stuck behind it: the car ahead
      // is knocked forward and swerves out of the lane, and the player keeps
      // most of their momentum — like barging through traffic.
      other.speed = Math.max(other.speed, Math.abs(car.speed) * 0.8);
      const road = nearestRoad(other.x, other.y);
      const laneCoord = other.axis === 'v' ? other.x : other.y;
      const carCoord = other.axis === 'v' ? car.x : car.y;
      const newLane = other.lane + (laneCoord >= carCoord ? 24 : -24);
      if (Math.abs(newLane - road.at) <= 40) other.lane = newLane;
      car.speed *= 0.92;
    } else if (other.parked) {
      // Knock a parked car loose; it rolls away and stops on its own.
      other.parked = false;
      other.speed = Math.abs(car.speed) * 0.5;
      car.speed *= 0.85;
    } else {
      const swap = car.speed;
      car.speed = other.speed * 0.6;
      other.speed = swap * 0.6;
    }
  }
  return hard;
}

// Damage a car; at 0 health it is wrecked and smokes.
export function damageCar(car, amount) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.smoke = 1;
  }
}

export { makeRng };
