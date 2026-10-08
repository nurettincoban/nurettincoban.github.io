// Drawing in the sky. A stroke is recorded as it is drawn — where on the disk, where on
// screen, how fast — and when it is released it replays itself three times, each
// quieter. At any moment one of them is in control of the sound: the pen while
// drawing, otherwise the newest replaying stroke.
//
// Drawing happens on the sky itself; on touch screens only there, so scrolling still
// works everywhere else. Holding still makes a black hole; letting go, a supernova.

const clock = () => performance.now() / 1000;

export function createDrawing(sky, view, { onStart, onRelease }) {
  const strokes = [];
  let drawing = false, rec = null, pen = null, penOnDisk = null, speed = 0, lastMove = null, hover = null;
  let heads = [], control = null;

  const record = () => rec.path.push({
    t: clock() - rec.t0, p: penOnDisk.slice(),
    x: pen.x / innerWidth, y: pen.y / innerHeight, v: Math.min(speed / 900, 1),
  });

  sky.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.hud')) return;
    const p = view.onDisk(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    drawing = true; speed = 0;
    pen = { x: e.clientX, y: e.clientY }; penOnDisk = p;
    lastMove = { x: e.clientX, y: e.clientY, t: clock() };
    rec = { t0: clock(), path: [] };
    record();
    try { sky.setPointerCapture(e.pointerId); } catch (x) {}
    onStart();
  });

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') hover = [e.clientX, e.clientY];
    if (!drawing) return;
    const now = clock(), dt = Math.max(now - lastMove.t, 0.008);
    speed += (Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt - speed) * 0.25;
    lastMove = { x: e.clientX, y: e.clientY, t: now };
    pen = { x: e.clientX, y: e.clientY };
    const p = view.onDisk(e.clientX, e.clientY);
    if (!p) return;
    penOnDisk = p;
    const last = rec.path[rec.path.length - 1];
    if (Math.hypot(p[0] - last.p[0], p[2] - last.p[2]) > 0.04 || now - rec.t0 - last.t > 0.05) record();
  }, { passive: true });

  function release() {
    if (!drawing) return;
    drawing = false;
    if (penOnDisk) record();
    strokes.push({ start: clock() + 0.15, dur: Math.max(clock() - rec.t0, 0.6), reps: 3, path: rec.path });
    if (strokes.length > 3) strokes.shift();
    onRelease(penOnDisk && penOnDisk.slice());
  }
  sky.addEventListener('pointerup', release);
  sky.addEventListener('pointercancel', release);
  addEventListener('blur', release);

  // Where a replaying stroke is now: its position, and the controls recorded with it.
  function headOf(s, now) {
    const el = now - s.start, path = s.path;
    if (el < 0 || !path.length) return null;
    const rep = Math.floor(el / s.dur);
    if (rep >= s.reps) return null;
    const local = el - rep * s.dur;
    let i = 1;
    while (i < path.length - 1 && path[i].t < local) i++;
    const a = path[Math.max(0, i - 1)], b = path[Math.min(i, path.length - 1)];
    const u = b.t > a.t ? Math.min(1, Math.max(0, (local - a.t) / (b.t - a.t))) : 0;
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    return { p: [0, 1, 2].map((j) => a.p[j] + (b.p[j] - a.p[j]) * u), x: mix('x'), y: mix('y'), v: mix('v'), gain: 0.72 ** (rep + 1) };
  }

  return {
    // Advances the replays and works out who is in control; returns that control
    // ({ x, y, v, gain, p }) or null when nothing is playing.
    update() {
      const now = clock();
      if (drawing && now - lastMove.t > 0.06) speed *= 0.8;          // the pen is resting
      heads = strokes.map((s) => headOf(s, now));
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (!heads[i] && now > strokes[i].start) { strokes.splice(i, 1); heads.splice(i, 1); }
      }
      control = drawing && pen
        ? { x: pen.x / innerWidth, y: pen.y / innerHeight, v: Math.min(speed / 900, 1), gain: 1, p: penOnDisk }
        : heads.filter(Boolean).pop() || null;
      return control;
    },
    cancel() { release(); strokes.length = 0; heads = []; },
    busy: () => drawing || strokes.length > 0,
    get drawing() { return drawing; },
    get pen() { return pen; },
    get penOnDisk() { return penOnDisk; },
    get hover() { return hover; },
    get heads() { return heads; },
    get control() { return control; },
  };
}
