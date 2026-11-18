// Porto Sol — Streets of the Sun
// city.js — procedural city generation. One job: turn a seed into Porto Sol.
// A 4800x3600 street grid, five districts, docks on the east, beach on the south,
// and one building per block placed by the seeded RNG. Deterministic: same seed,
// same city, every run.

import { WORLD_W, WORLD_H, ROADS_V, ROADS_H, WATER_X, BEACH_Y, BUILDING_COLORS } from './config.js';
import { makeRng, hashPick } from './rng.js';

// Which district owns a point. Order matters: water and beach win over land.
export function districtAt(x, y) {
  if (x >= WATER_X) return 'water';
  if (y >= BEACH_Y) return 'beach';
  if (y < 900) return 'hills';
  if (x >= 1600 && x <= 3200 && y >= 900 && y <= 2300) return 'downtown';
  if (x > 3600) return 'port';
  if (y > 2800) return 'marina';
  return 'barrio';
}

export function districtName(key) {
  if (key === 'water') return 'Old Port docks';
  if (key === 'beach') return 'Marina Beach';
  if (key === 'hills') return 'North Hills';
  if (key === 'downtown') return 'Downtown';
  if (key === 'port') return 'Old Port';
  if (key === 'marina') return 'Marina Beach';
  return 'El Barrio';
}

// True when a point sits on a road (not on a block, sidewalk counts as road edge).
export function onRoad(x, y) {
  for (const rx of ROADS_V) if (Math.abs(x - rx) <= 36) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) <= 36) return true;
  return false;
}

// Nearest road centreline to a point, and which axis it runs on.
export function nearestRoad(x, y) {
  let bestV = ROADS_V[0], bd = Infinity;
  for (const rx of ROADS_V) { const d = Math.abs(x - rx); if (d < bd) { bd = d; bestV = rx; } }
  let bestH = ROADS_H[0], bd2 = Infinity;
  for (const ry of ROADS_H) { const d = Math.abs(y - ry); if (d < bd2) { bd2 = d; bestH = ry; } }
  return bd <= bd2 ? { axis: 'v', at: bestV } : { axis: 'h', at: bestH };
}

// Build the whole city from a seed. Returns plain data the renderer and the
// simulation both read; nothing here touches the DOM.
export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  // One park plaza in the middle of Downtown: no buildings, just green.
  const park = { bx: 4, by: 3 };

  for (let i = 0; i < ROADS_V.length - 1; i++) {
    for (let j = 0; j < ROADS_H.length - 1; j++) {
      const x0 = ROADS_V[i] + 62;
      const y0 = ROADS_H[j] + 62;
      const x1 = ROADS_V[i + 1] - 62;
      const y1 = ROADS_H[j + 1] - 62;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      if (d === 'water' || d === 'beach') continue;
      if (i === park.bx && j === park.by) continue; // the plaza
      const count = d === 'downtown' ? rng.int(1, 2) : rng.int(1, 3);
      const bw = (x1 - x0) / (count === 1 ? 1 : 2);
      const bh = (y1 - y0) / (count <= 2 ? 1 : 2);
      for (let k = 0; k < count; k++) {
        const gx = k % 2;
        const gy = Math.floor(k / 2);
        const w = rng.range(bw * 0.55, bw * 0.85);
        const h = rng.range(bh * 0.55, bh * 0.85);
        const bx = x0 + gx * bw + (bw - w) / 2 + rng.range(-8, 8);
        const by = y0 + gy * bh + (bh - h) / 2 + rng.range(-8, 8);
        buildings.push({
          x: bx, y: by, w, h,
          district: d,
          color: hashPick(Math.round(bx), Math.round(by), BUILDING_COLORS[d]),
          tall: d === 'downtown' ? rng.range(1.4, 2.2) : rng.range(0.9, 1.3),
          winSeed: Math.round(bx * 7 + by * 13),
        });
      }
    }
  }

  // Park plaza rectangle, for the renderer.
  const plaza = {
    x: ROADS_V[park.bx] + 62, y: ROADS_H[park.by] + 62,
    w: ROADS_V[park.bx + 1] - ROADS_V[park.bx] - 124,
    h: ROADS_H[park.by + 1] - ROADS_H[park.by] - 124,
  };

  // Spatial index: block key "i,j" -> buildings in that block, for fast collision.
  const byBlock = new Map();
  for (const b of buildings) {
    const i = Math.max(0, Math.min(ROADS_V.length - 2, Math.floor((b.x + b.w / 2 - ROADS_V[0]) / 400)));
    const j = Math.max(0, Math.min(ROADS_H.length - 2, Math.floor((b.y + b.h / 2 - ROADS_H[0]) / 400)));
    const key = i + ',' + j;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(b);
  }

  return { seed, buildings, byBlock, plaza, width: WORLD_W, height: WORLD_H };
}

// Buildings near a point (its block plus neighbours) — the only ones that can
// possibly collide with a circle at (x, y).
export function buildingsNear(city, x, y) {
  const i = Math.floor((x - ROADS_V[0]) / 400);
  const j = Math.floor((y - ROADS_H[0]) / 400);
  const out = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const list = city.byBlock.get((i + di) + ',' + (j + dj));
      if (list) for (const b of list) out.push(b);
    }
  }
  return out;
}

// Push a circle (x, y, r) out of every building it overlaps. Returns corrected [x, y].
export function resolveCircleBuildings(city, x, y, r) {
  for (const b of buildingsNear(city, x, y)) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Dead centre inside the building: push out along the shortest side.
        const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return [x, y];
}

// True when a circle overlaps any building.
export function hitsBuilding(city, x, y, r) {
  for (const b of buildingsNear(city, x, y)) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
