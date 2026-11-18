// Porto Sol — Streets of the Sun
// input.js — keyboard + mouse. One job: turn DOM events into a clean per-frame
// picture of what the player is doing (held keys, just-pressed keys, mouse aim).

export const ACTION = {
  ENTER: 1,
  PAUSE: 2,
  MUTE: 4,
  CONFIRM: 8,
};

export function createInput(canvas) {
  const held = new Set();
  const justPressed = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held.add(e.code);
    justPressed.add(e.code);
    if (e.code === 'Enter') actions |= ACTION.ENTER | ACTION.CONFIRM;
    if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACTION.PAUSE;
    if (e.code === 'KeyM') actions |= ACTION.MUTE;
    // Keep the game keys from scrolling the page.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    mouse.down = true;
    mouse.clicked = true;
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    e.preventDefault();
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    mouse,
    isDown(code) { return held.has(code); },
    // WASD / arrows as a -1..1 axis pair, normalised.
    moveAxis() {
      let x = 0, y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) { x *= 0.7071; y *= 0.7071; }
      return { x, y };
    },
    sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    handbrake() { return held.has('Space'); },
    // Edge-triggered: true once per physical press, then cleared by endFrame().
    pressed(code) { return justPressed.has(code); },
    // Consuming edge-trigger: true once per physical press, and the press is
    // gone afterwards — so a frame that runs two simulation steps can never
    // see (and double-apply) the same press, e.g. enter-then-exit a car.
    takePressed(code) {
      if (justPressed.has(code)) { justPressed.delete(code); return true; }
      return false;
    },
    // Number keys 1..5, for the mission menu.
    numberPressed() {
      for (let n = 1; n <= 5; n++) if (justPressed.has('Digit' + n) || justPressed.has('Numpad' + n)) return n;
      return 0;
    },
    takeActions() {
      const a = actions;
      actions = 0;
      return a;
    },
    mouseClicked() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c;
    },
    endFrame() { justPressed.clear(); },
  };
}
