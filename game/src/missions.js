// Porto Sol — Streets of the Sun
// missions.js — the five story jobs from Mara Solis. One job: what the current
// job asks for, in order, and when it is done. Steps are simple "go here" goals;
// a race is a chain of gates, a getaway adds wanted stars at the start.

import { PLACES, MISSION_REWARDS } from './config.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'First Fare',
    brief: 'Mara needs a driver she can trust. Pick up her client in Downtown and drop him at Marina Beach. No trouble, no heat.',
    reward: MISSION_REWARDS[0],
    steps: [
      { kind: 'goto', x: PLACES.maraOffice.x, y: PLACES.maraOffice.y, r: 80, label: 'Pick up the client — Downtown' },
      { kind: 'goto', x: PLACES.marina.x, y: PLACES.marina.y, r: 80, label: 'Drop the client — Marina Beach' },
    ],
  },
  {
    id: 2,
    name: 'Hot Delivery',
    brief: 'A package in El Barrio, a buyer at the Old Port docks. The package is hot — the cops will be watching. 100 seconds, Rico.',
    reward: MISSION_REWARDS[1],
    timeLimit: 100,
    wantedOnStart: 1,
    steps: [
      { kind: 'goto', x: PLACES.barrio.x, y: PLACES.barrio.y, r: 80, label: 'Grab the package — El Barrio' },
      { kind: 'goto', x: PLACES.port.x, y: PLACES.port.y, r: 80, label: 'Deliver to the docks — Old Port' },
    ],
  },
  {
    id: 3,
    name: 'Street Race',
    brief: 'The North Hills crew thinks their cars are faster than yours. Four gates across the city, 150 seconds. Prove them wrong.',
    reward: MISSION_REWARDS[2],
    timeLimit: 150,
    steps: [
      { kind: 'goto', x: PLACES.raceA.x, y: PLACES.raceA.y, r: 90, label: 'Race gate 1 of 4' },
      { kind: 'goto', x: PLACES.raceB.x, y: PLACES.raceB.y, r: 90, label: 'Race gate 2 of 4' },
      { kind: 'goto', x: PLACES.raceC.x, y: PLACES.raceC.y, r: 90, label: 'Race gate 3 of 4' },
      { kind: 'goto', x: PLACES.raceD.x, y: PLACES.raceD.y, r: 90, label: 'Race gate 4 of 4' },
      { kind: 'goto', x: PLACES.maraOffice.x, y: PLACES.maraOffice.y, r: 80, label: 'Back to Mara — Downtown' },
    ],
  },
  {
    id: 4,
    name: 'Bank Job Getaway',
    brief: 'The crew hit the Downtown bank and you are the wheelman. Three stars on your head. Lose them and get to the North Hills safehouse.',
    reward: MISSION_REWARDS[3],
    wantedOnStart: 3,
    steps: [
      { kind: 'goto', x: PLACES.maraOffice.x, y: PLACES.maraOffice.y, r: 80, label: 'Pick up the crew — Downtown' },
      { kind: 'goto', x: PLACES.hills.x, y: PLACES.hills.y, r: 90, label: 'Reach the safehouse — North Hills' },
    ],
  },
  {
    id: 5,
    name: 'The Big Score',
    brief: 'One last job. Collect the crew at the docks, hit the Downtown vault, then vanish to the Marina boardwalk. Four stars. Make it count.',
    reward: MISSION_REWARDS[4],
    wantedOnStart: 0,
    wantedAtStep: { 1: 4 }, // heat jumps when the vault step starts
    steps: [
      { kind: 'goto', x: PLACES.crew.x, y: PLACES.crew.y, r: 80, label: 'Collect the crew — Old Port' },
      { kind: 'goto', x: PLACES.vault.x, y: PLACES.vault.y, r: 80, label: 'Hit the vault — Downtown' },
      { kind: 'goto', x: PLACES.beach.x, y: PLACES.beach.y, r: 90, label: 'Vanish — Marina boardwalk' },
    ],
  },
];

export function createMissionManager() {
  const m = {
    active: null, // mission object
    stepIdx: 0,
    timer: 0, // seconds left, 0 = no limit
    done: false,
    failed: false,
    failReason: '',
  };

  function start(mission) {
    m.active = mission;
    m.stepIdx = 0;
    m.timer = mission.timeLimit || 0;
    m.done = false;
    m.failed = false;
    m.failReason = '';
    return mission.wantedOnStart || 0;
  }

  function currentStep() {
    if (!m.active) return null;
    return m.active.steps[m.stepIdx] || null;
  }

  function objectiveLabel() {
    const s = currentStep();
    if (!s) return m.active ? 'Job done — head back to Mara' : '';
    return s.label;
  }

  // Advance the mission one step. Returns 'complete' | 'failed' | 'step' | null.
  // px, py: player position. setWanted(n): callback the world gives us.
  function update(dt, px, py, setWanted) {
    if (!m.active || m.done || m.failed) return null;
    if (m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.failed = true;
        m.failReason = 'Out of time — Mara found someone else.';
        return 'failed';
      }
    }
    const s = currentStep();
    if (!s) return null;
    const d = Math.hypot(px - s.x, py - s.y);
    if (d <= s.r) {
      m.stepIdx += 1;
      const next = currentStep();
      if (!next) {
        m.done = true;
        return 'complete';
      }
      if (m.active.wantedAtStep && m.active.wantedAtStep[m.stepIdx] !== undefined) {
        setWanted(m.active.wantedAtStep[m.stepIdx]);
      }
      return 'step';
    }
    return null;
  }

  function abort(reason) {
    if (!m.active) return;
    m.failed = true;
    m.failReason = reason || 'Job blown.';
  }

  function clear() {
    m.active = null;
    m.stepIdx = 0;
    m.timer = 0;
    m.done = false;
    m.failed = false;
    m.failReason = '';
  }

  return { m, start, currentStep, objectiveLabel, update, abort, clear };
}
