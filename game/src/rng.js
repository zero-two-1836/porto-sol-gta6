// Porto Sol — Streets of the Sun
// rng.js — the seeded random number generator. One job: deterministic randomness.
// Every random choice in the game comes from here so a fixed seed replays exactly.

// mulberry32 — small, fast, deterministic for a given 32-bit seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tiny RNG object with the helpers the game uses.
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}

// Deterministic 2D hash — same (x, y) always gives the same value in [0, 1).
// Used for per-building details (windows, roof tone) without storing extra state.
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Deterministic pick from a list by coordinates (for building colours, etc).
export function hashPick(x, y, list) {
  return list[Math.floor(hash2(x, y) * list.length) % list.length];
}
