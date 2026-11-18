// Porto Sol — Streets of the Sun
// render.js — canvas drawing only. One job: turn world state into pixels —
// the sun-soaked city, cars, people, particles, the HUD with minimap and wanted
// stars, and every menu screen. It never changes the simulation.

import { WORLD_W, WORLD_H, ROADS_V, ROADS_H, WATER_X, BEACH_Y, DISTRICTS, POLICE_LIGHT } from './config.js';
import { districtAt, districtName } from './city.js';
import { hash2 } from './rng.js';
import { MISSIONS } from './missions.js';
import { STATE_TITLE, STATE_PAUSE, STATE_MENU, STATE_COMPLETE, STATE_FAILED, STATE_BUSTED } from './world.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TITLE_FONT = 'Georgia, "Times New Roman", serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let titleButtons = []; // {id, x, y, w, h} in screen pixels, for click handling
  let menuButtons = [];
  let viewW = 1280, viewH = 720;

  function resize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = viewW;
    canvas.height = viewH;
  }
  resize();
  window.addEventListener('resize', resize);

  function text(value, x, y, size, color, align = 'left', font = FONT, weight = '') {
    ctx.font = (weight ? weight + ' ' : '') + size + 'px ' + font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  // --- city ----------------------------------------------------------------
  function drawGround(cam, vw, vh) {
    const x0 = cam.x - vw / 2, y0 = cam.y - vh / 2;
    // Base ground: El Barrio warm brown, then district blocks over it.
    ctx.fillStyle = DISTRICTS.barrio.ground;
    ctx.fillRect(x0, y0, vw, vh);
    ctx.fillStyle = DISTRICTS.hills.ground;
    ctx.fillRect(x0, 0, vw, 900 - y0 > 0 ? Math.min(vh, 900 - y0) : 0);
    ctx.fillStyle = DISTRICTS.downtown.ground;
    ctx.fillRect(1600, 900, 1600, 1400);
    ctx.fillStyle = DISTRICTS.port.ground;
    ctx.fillRect(3600, 900, WATER_X - 3600, 2400);
    ctx.fillStyle = DISTRICTS.marina.ground;
    ctx.fillRect(x0, 2800, vw, 500);
    // Water + beach.
    ctx.fillStyle = '#1d4e6b';
    ctx.fillRect(WATER_X, y0, WORLD_W - WATER_X, vh);
    ctx.fillStyle = '#256b8a';
    ctx.fillRect(WATER_X, y0, 40, vh); // shoreline shade
    ctx.fillStyle = '#d9b380';
    ctx.fillRect(x0, BEACH_Y, vw, WORLD_H - BEACH_Y);
    // Park plaza.
    ctx.fillStyle = '#4a7a44';
    return { x0, y0 };
  }

  function drawRoads(cam, vw, vh) {
    const x0 = cam.x - vw / 2, y0 = cam.y - vh / 2;
    // Sidewalk skirts first (wider, lighter), then asphalt, then centre dashes.
    ctx.fillStyle = '#6b6257';
    for (const rx of ROADS_V) ctx.fillRect(rx - 52, y0, 104, vh);
    for (const ry of ROADS_H) ctx.fillRect(x0, ry - 52, vw, 104);
    ctx.fillStyle = '#33302f';
    for (const rx of ROADS_V) ctx.fillRect(rx - 36, y0, 72, vh);
    for (const ry of ROADS_H) ctx.fillRect(x0, ry - 36, vw, 72);
    // Centre dashes.
    ctx.fillStyle = '#d8b13a';
    ctx.setLineDash([26, 30]);
    ctx.strokeStyle = '#d8b13a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const rx of ROADS_V) { ctx.moveTo(rx, y0); ctx.lineTo(rx, y0 + vh); }
    for (const ry of ROADS_H) { ctx.moveTo(x0, ry); ctx.lineTo(x0 + vw, ry); }
    ctx.stroke();
    ctx.setLineDash([]);
    // Docks: piers into the water.
    ctx.fillStyle = '#6a5a4a';
    for (let i = 0; i < 3; i++) ctx.fillRect(WATER_X - 10, 1100 + i * 600, 130, 46);
    // Beach umbrellas.
    for (let i = 0; i < 8; i++) {
      const ux = 300 + i * 520, uy = 3440;
      ctx.fillStyle = i % 2 ? '#e74c3c' : '#f1c40f';
      ctx.beginPath(); ctx.arc(ux, uy, 16, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBuildings(city, cam, vw, vh) {
    const x0 = cam.x - vw / 2, y0 = cam.y - vh / 2, x1 = x0 + vw, y1 = y0 + vh;
    // Plaza trees.
    const p = city.plaza;
    ctx.fillStyle = '#4a7a44';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#3a6a38';
    for (let i = 0; i < 6; i++) {
      const tx = p.x + 40 + (i % 3) * 110, ty = p.y + 40 + Math.floor(i / 3) * 120;
      ctx.beginPath(); ctx.arc(tx, ty, 22, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of city.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      // Drop shadow: tall downtown blocks cast further.
      const sh = 6 * b.tall;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Roof edge.
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x, b.y, b.w, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x, b.y + b.h - 6, b.w, 6);
      // Windows: deterministic grid from the building's seed.
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(2, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const lit = hash2(b.winSeed + cx * 31, b.winSeed + cy * 17) > 0.55;
          ctx.fillStyle = lit ? 'rgba(255,214,120,0.85)' : 'rgba(20,26,40,0.55)';
          ctx.fillRect(b.x + 10 + cx * ((b.w - 20) / cols), b.y + 10 + cy * ((b.h - 20) / rows), 12, 12);
        }
      }
    }
  }

  // --- actors ---------------------------------------------------------------
  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.wrecked) {
      ctx.fillStyle = '#222222';
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-22, -12, 46, 26);
    }
    // Body.
    ctx.fillStyle = car.wrecked ? '#1c1c1c' : car.color;
    roundRect(-23, -11, 46, 22, 6);
    ctx.fill();
    // Windshield + roof.
    ctx.fillStyle = car.wrecked ? '#111111' : '#9fc4e8';
    ctx.fillRect(-6, -8, 10, 16);
    ctx.fillStyle = car.wrecked ? '#1c1c1c' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(6, -8, 8, 16);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(21, -9, 3, 4);
    ctx.fillRect(21, 5, 3, 4);
    // Police light bar, flashing with the clock.
    if (car.police) {
      const red = Math.floor(time * 3) % 2 === 0;
      ctx.fillStyle = red ? '#ff2d2d' : '#2d7bff';
      ctx.fillRect(-4, -11, 8, 5);
      ctx.fillStyle = red ? '#2d7bff' : '#ff2d2d';
      ctx.fillRect(-4, 6, 8, 5);
      ctx.fillStyle = '#ffffff';
      text('PD', 0, 4, 9, '#ffffff', 'center', FONT, 'bold');
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPed(ped, time) {
    if (ped.down) {
      // Lying flat, fading out.
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, ped.downTimer / 2));
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      roundRect(-11, -5, 22, 10, 5);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath(); ctx.arc(14, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    // Walking bob.
    const bob = Math.sin(time * 10 + ped.id) * 1.5;
    ctx.save();
    ctx.translate(ped.x, ped.y + bob * 0.3);
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-6, -5, 10, 10);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(3, 0, 5, 0, Math.PI * 2); ctx.fill();
    if (ped.cop) {
      ctx.fillStyle = '#0f1620';
      ctx.beginPath(); ctx.arc(3, 0, 5.5, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(-8, -2, 3, 4); // badge glint
    }
    ctx.restore();
  }

  function drawPlayer(world, time) {
    const p = world.player;
    if (!p.onFoot) return; // inside the car
    const bob = Math.sin(time * 12) * 1.5;
    ctx.save();
    ctx.translate(p.x, p.y + bob * 0.3);
    ctx.rotate(p.angle);
    // Rico: orange jacket, dark jeans — readable at a glance.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-7, -6, 11, 12);
    ctx.fillStyle = '#e67e22';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(3, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath(); ctx.arc(4, 0, 5.5, Math.PI, Math.PI * 2); ctx.fill(); // hair
    // Gun arm when aiming with the mouse held.
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(15, 0); ctx.stroke();
    ctx.restore();
    // Aim reticle at the mouse.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    const ax = p.x + Math.cos(p.aimAngle) * 46;
    const ay = p.y + Math.sin(p.aimAngle) * 46;
    ctx.beginPath(); ctx.arc(ax, ay, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax - 11, ay); ctx.lineTo(ax - 4, ay); ctx.moveTo(ax + 4, ay); ctx.lineTo(ax + 11, ay); ctx.stroke();
  }

  function drawParticles(world) {
    for (const p of world.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawObjective(world, time) {
    const step = world.missions.currentStep();
    if (!step || world.state === STATE_TITLE) return;
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    ctx.save();
    ctx.translate(step.x, step.y);
    // Ground ring + beam.
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 52 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,215,106,0.16)';
    ctx.beginPath(); ctx.arc(0, 0, 52 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(0, -26); ctx.lineTo(18, 0); ctx.lineTo(0, 26); ctx.lineTo(-18, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Distance label.
    const d = Math.round(Math.hypot(world.player.x - step.x, world.player.y - step.y));
    text(d + ' m', step.x, step.y - 62, 15, '#ffd76a', 'center', FONT, 'bold');
  }

  // --- HUD -------------------------------------------------------------------
  function drawMinimap(world) {
    const mw = 210, mh = 158, mx = viewW - mw - 16, my = 16;
    const sx = mw / WORLD_W, sy = mh / WORLD_H;
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,16,0.78)';
    roundRect(mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    // Water + beach.
    ctx.fillStyle = '#1d4e6b';
    ctx.fillRect(mx + WATER_X * sx, my, (WORLD_W - WATER_X) * sx, mh);
    ctx.fillStyle = '#d9b380';
    ctx.fillRect(mx, my + BEACH_Y * sy, mw, (WORLD_H - BEACH_Y) * sy);
    // Roads.
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    for (const rx of ROADS_V) { ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke(); }
    for (const ry of ROADS_H) { ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke(); }
    // Objective.
    const step = world.missions.currentStep();
    if (step) {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(mx + step.x * sx, my + step.y * sy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(mx + step.x * sx, my + step.y * sy, 8 + Math.sin(world.time * 5) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic (grey), police (red), player (white arrow).
    for (const c of world.cars) {
      ctx.fillStyle = c.police ? '#ff2d2d' : 'rgba(255,255,255,0.55)';
      ctx.fillRect(mx + c.x * sx - 1.5, my + c.y * sy - 1.5, 3, 3);
    }
    ctx.save();
    ctx.translate(mx + world.player.x * sx, my + world.player.y * sy);
    ctx.rotate(world.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    text('PORTO SOL', mx + mw / 2, my + mh + 22, 11, 'rgba(255,255,255,0.6)', 'center', FONT, 'bold');
  }

  function drawHud(world) {
    // Top-left: cash + district.
    ctx.fillStyle = 'rgba(10,10,16,0.62)';
    roundRect(14, 12, 250, 62, 8);
    ctx.fill();
    text('$' + world.cash.toLocaleString('en-US'), 28, 42, 28, '#7be495', 'left', FONT, 'bold');
    const d = districtName(districtAt(world.player.x, world.player.y));
    text(d, 28, 64, 14, 'rgba(255,255,255,0.75)');
    // Wanted stars, top centre.
    const level = world.wanted.w.level;
    ctx.fillStyle = 'rgba(10,10,16,0.62)';
    const sw = 210;
    roundRect(viewW / 2 - sw / 2, 12, sw, 44, 8);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      text('★', viewW / 2 - 78 + i * 36, 44, 30, i < level ? '#ffd76a' : 'rgba(255,255,255,0.22)', 'center');
    }
    // Objective pill under the stars.
    const label = world.missions.objectiveLabel();
    if (label) {
      ctx.font = 'bold 15px ' + FONT;
      const w = Math.min(viewW - 40, ctx.measureText(label).width + 36);
      ctx.fillStyle = 'rgba(10,10,16,0.62)';
      roundRect(viewW / 2 - w / 2, 64, w, 32, 16);
      ctx.fill();
      text(label, viewW / 2, 86, 15, '#ffd76a', 'center', FONT, 'bold');
      const timer = world.missions.m.timer;
      if (timer > 0) {
        text(Math.ceil(timer) + 's', viewW / 2 + w / 2 + 14, 86, 15, timer < 20 ? '#ff5a4a' : '#ffffff', 'left', FONT, 'bold');
      }
    }
    // Bottom-right: speed + car health.
    if (!world.player.onFoot && world.player.car) {
      const car = world.player.car;
      const kmh = Math.round(Math.abs(car.speed) * 0.32);
      ctx.fillStyle = 'rgba(10,10,16,0.62)';
      roundRect(viewW - 196, viewH - 78, 182, 64, 8);
      ctx.fill();
      text(kmh + '', viewW - 30, viewH - 36, 30, '#ffffff', 'right', FONT, 'bold');
      text('km/h', viewW - 88, viewH - 36, 14, 'rgba(255,255,255,0.7)', 'right');
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(viewW - 182, viewH - 28, 154, 6);
      ctx.fillStyle = car.health > 40 ? '#7be495' : '#ff5a4a';
      ctx.fillRect(viewW - 182, viewH - 28, 154 * Math.max(0, car.health / 100), 6);
    }
    // Bottom-left: controls hint early on.
    if (world.time < 25 && world.state === 'play') {
      text('WASD drive / walk   ·   E steal or enter car   ·   F punch   ·   Click shoot   ·   Enter jobs   ·   P pause', 16, viewH - 16, 13, 'rgba(255,255,255,0.65)');
    }
    // Toast.
    if (world.toastTimer > 0) {
      ctx.font = 'bold 16px ' + FONT;
      const w = ctx.measureText(world.toast).width + 36;
      ctx.fillStyle = 'rgba(10,10,16,0.72)';
      roundRect(viewW / 2 - w / 2, viewH - 96, w, 36, 18);
      ctx.fill();
      text(world.toast, viewW / 2, viewH - 72, 16, '#ffffff', 'center', FONT, 'bold');
    }
    drawMinimap(world);
  }

  // --- overlays ---------------------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,8,14,0.82)';
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,106,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function button(x, y, w, h, label, id, enabled = true) {
    ctx.fillStyle = enabled ? '#e67e22' : '#444444';
    roundRect(x, y, w, h, 8);
    ctx.fill();
    text(label, x + w / 2, y + h / 2 + 6, 17, enabled ? '#ffffff' : '#999999', 'center', FONT, 'bold');
    return { id, x, y, w, h, enabled };
  }

  function drawTitle(world, hasSave) {
    // Dusk wash over the city behind the title.
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, 'rgba(255,140,60,0.22)');
    g.addColorStop(0.55, 'rgba(120,40,90,0.18)');
    g.addColorStop(1, 'rgba(10,8,20,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, viewW, viewH);

    const cx = viewW / 2;
    text('PORTO SOL', cx, 170, 84, '#ffb347', 'center', TITLE_FONT, 'bold');
    text('S T R E E T S   O F   T H E   S U N', cx, 208, 20, '#ffd76a', 'center', FONT, 'bold');
    text('Rico Vega drives for Mara Solis, the fixer who runs Porto Sol after dark.', cx, 258, 17, '#ffffff', 'center');
    text('Five jobs. One city. Lose the cops, keep the cash.', cx, 284, 17, 'rgba(255,255,255,0.8)', 'center');

    titleButtons = [];
    let by = 330;
    if (hasSave) {
      titleButtons.push(button(cx - 150, by, 300, 48, 'CONTINUE  ($' + world.cash.toLocaleString('en-US') + ')', 'continue'));
      by += 60;
    }
    titleButtons.push(button(cx - 150, by, 300, 48, hasSave ? 'NEW GAME' : 'START  —  NEW GAME', 'new'));
    by += 60;
    titleButtons.push(button(cx - 150, by, 300, 48, 'HOW TO PLAY', 'how'));
    const showHow = world.showHow;
    if (showHow) {
      panel(cx - 330, by + 66, 660, 190);
      const lines = [
        'WASD / arrows — walk or drive      Shift — sprint',
        'E — steal / enter a car, get out      Space — handbrake',
        'F — punch      Mouse aim + click — shoot',
        'Enter — job menu (5 story missions)      P — pause      M — mute',
        'Steal cars, run jobs, build heat — then lay low to lose the stars.',
      ];
      lines.forEach((l, i) => text(l, cx, by + 100 + i * 28, 15, '#ffffff', 'center'));
    } else {
      text('WASD drive · E steal car · F punch · Click shoot · Enter jobs', cx, by + 92, 14, 'rgba(255,255,255,0.65)', 'center');
    }
    text('Progress autosaves. An original game — no part of any other series.', cx, viewH - 24, 12, 'rgba(255,255,255,0.45)', 'center');
  }

  function drawPause(world) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    const cx = viewW / 2;
    panel(cx - 260, viewH / 2 - 130, 520, 260);
    text('PAUSED', cx, viewH / 2 - 66, 44, '#ffffff', 'center', TITLE_FONT, 'bold');
    text('Porto Sol waits for no one — except now.', cx, viewH / 2 - 28, 15, 'rgba(255,255,255,0.75)', 'center');
    titleButtons = [
      button(cx - 150, viewH / 2 + 6, 300, 46, 'RESUME', 'resume'),
      button(cx - 150, viewH / 2 + 62, 300, 46, 'QUIT TO TITLE', 'quit'),
    ];
  }

  function drawMenu(world) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, viewW, viewH);
    const cx = viewW / 2;
    const w = 640, top = 84;
    panel(cx - w / 2, top, w, 560);
    text("MARA'S JOBS", cx, top + 52, 34, '#ffd76a', 'center', TITLE_FONT, 'bold');
    text('Pick a job. Each one pays when the drop is made.', cx, top + 82, 15, 'rgba(255,255,255,0.75)', 'center');
    menuButtons = [];
    MISSIONS.forEach((m, i) => {
      const y = top + 110 + i * 82;
      const unlocked = m.id <= world.progress + 1;
      const done = m.id <= world.progress;
      ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
      roundRect(cx - w / 2 + 24, y, w - 48, 70, 8);
      ctx.fill();
      text((done ? '✓ ' : '') + i + 1 + '. ' + m.name, cx - w / 2 + 44, y + 28, 19, unlocked ? '#ffffff' : '#777777', 'left', FONT, 'bold');
      text(unlocked ? m.brief : 'Finish job ' + m.id + ' first.', cx - w / 2 + 44, y + 52, 13, 'rgba(255,255,255,0.6)');
      text(unlocked ? '$' + m.reward.toLocaleString('en-US') : 'LOCKED', cx + w / 2 - 44, y + 28, 17, done ? '#7be495' : '#ffd76a', 'right', FONT, 'bold');
      menuButtons.push({ id: 'mission-' + i, x: cx - w / 2 + 24, y, w: w - 48, h: 70, enabled: unlocked });
    });
    text('Press 1–5 or click a job · Esc to close', cx, top + 532, 14, 'rgba(255,255,255,0.6)', 'center');
  }

  function drawComplete(world) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, viewW, viewH);
    const m = world.completedMission;
    const cx = viewW / 2;
    panel(cx - 300, viewH / 2 - 140, 600, 280);
    text('JOB COMPLETE', cx, viewH / 2 - 74, 42, '#7be495', 'center', TITLE_FONT, 'bold');
    text(m ? m.name : '', cx, viewH / 2 - 30, 20, '#ffffff', 'center', FONT, 'bold');
    text('Mara pays $' + (m ? m.reward.toLocaleString('en-US') : '0') + '  ·  total cash $' + world.cash.toLocaleString('en-US'), cx, viewH / 2 + 6, 17, '#ffd76a', 'center');
    text(world.progress >= 5 ? 'All five jobs done. Porto Sol is yours, Rico.' : 'Job ' + world.progress + ' of 5 done — ' + (5 - world.progress) + ' to go.', cx, viewH / 2 + 36, 15, 'rgba(255,255,255,0.8)', 'center');
    titleButtons = [button(cx - 150, viewH / 2 + 66, 300, 46, 'BACK TO THE STREETS', 'resume')];
  }

  function drawFailed(world) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, viewW, viewH);
    const cx = viewW / 2;
    panel(cx - 300, viewH / 2 - 120, 600, 240);
    text('JOB FAILED', cx, viewH / 2 - 56, 40, '#ff5a4a', 'center', TITLE_FONT, 'bold');
    text(world.failReason || 'The job fell through.', cx, viewH / 2 - 14, 16, '#ffffff', 'center');
    text('Mara will let you try again. She always does.', cx, viewH / 2 + 16, 14, 'rgba(255,255,255,0.75)', 'center');
    titleButtons = [button(cx - 150, viewH / 2 + 46, 300, 46, 'TRY AGAIN', 'retry')];
  }

  function drawBusted(world) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, viewW, viewH);
    const cx = viewW / 2;
    panel(cx - 300, viewH / 2 - 120, 600, 240);
    text('BUSTED', cx, viewH / 2 - 56, 44, '#ff5a4a', 'center', TITLE_FONT, 'bold');
    text('The Porto Sol PD got you. They took $' + world.bustedLoss.toLocaleString('en-US') + ' off you.', cx, viewH / 2 - 12, 16, '#ffffff', 'center');
    text('You wake up at the North Hills safehouse, clean — for now.', cx, viewH / 2 + 18, 14, 'rgba(255,255,255,0.75)', 'center');
    titleButtons = [button(cx - 150, viewH / 2 + 48, 300, 46, 'BACK TO THE STREETS', 'resume')];
  }

  // --- main draw -------------------------------------------------------------
  function draw(world, hasSave) {
    const cam = world.cam;
    viewW = canvas.width;
    viewH = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, viewW, viewH);

    // World space: camera centred.
    ctx.save();
    ctx.translate(viewW / 2 - cam.x, viewH / 2 - cam.y);
    drawGround(cam, viewW, viewH);
    drawRoads(cam, viewW, viewH);
    drawBuildings(world.city, cam, viewW, viewH);
    drawObjective(world, world.time);
    // Cars under peds under the player, roughly.
    for (const c of world.cars) drawCar(c, world.time);
    for (const p of world.peds) drawPed(p, world.time);
    drawPlayer(world, world.time);
    drawParticles(world);
    ctx.restore();

    // Screen space: HUD + overlays.
    if (world.state === STATE_TITLE) {
      drawTitle(world, hasSave);
    } else {
      drawHud(world);
      if (world.state === STATE_PAUSE) drawPause(world);
      else if (world.state === STATE_MENU) drawMenu(world);
      else if (world.state === STATE_COMPLETE) drawComplete(world);
      else if (world.state === STATE_FAILED) drawFailed(world);
      else if (world.state === STATE_BUSTED) drawBusted(world);
    }
  }

  return {
    draw,
    get viewW() { return viewW; },
    get viewH() { return viewH; },
    titleButtons() { return titleButtons; },
    menuButtons() { return menuButtons; },
  };
}
