// Porto Sol — Streets of the Sun
// wanted.js — the heat. One job: track the 1–5 star wanted level, add stars for
// crimes, and let the heat fall when the player lays low and stays out of sight.

import { TUNE } from './config.js';

export function createWanted() {
  const w = {
    level: 0, // 0 = clean, 1–5 stars
    sinceCrime: 999, // seconds since the last crime
    fallTimer: 0, // counts down to losing one star while calm
    bustTimer: 0, // counts up while a cop holds the player
    lastCrime: '',
  };

  function setLevel(n, reason) {
    const before = w.level;
    w.level = Math.max(0, Math.min(5, n));
    if (w.level > before) {
      w.sinceCrime = 0;
      w.fallTimer = 0;
      if (reason) w.lastCrime = reason;
    }
    return w.level;
  }

  function addCrime(stars, reason) {
    if (w.level >= 5) return w.level;
    return setLevel(w.level + stars, reason);
  }

  function clear(reason) {
    w.level = 0;
    w.bustTimer = 0;
    if (reason) w.lastCrime = reason;
  }

  // dt: step. copsNear: true when any police unit is within ~500 units.
  // Returns 'busted' when a cop has held the player long enough, else null.
  function update(dt, copsNear, beingHeld) {
    w.sinceCrime += dt;
    if (beingHeld) {
      w.bustTimer += dt;
      if (w.bustTimer >= TUNE.bustTime) return 'busted';
    } else {
      w.bustTimer = Math.max(0, w.bustTimer - dt * 2);
    }
    // Lay low: no crime for a while and no cop in sight, and the heat falls.
    if (w.level > 0 && w.sinceCrime > TUNE.calmTime && !copsNear) {
      w.fallTimer += dt;
      if (w.fallTimer >= TUNE.heatFallEvery) {
        w.fallTimer = 0;
        w.level -= 1;
      }
    } else {
      w.fallTimer = 0;
    }
    return null;
  }

  return { w, setLevel, addCrime, clear, update };
}
