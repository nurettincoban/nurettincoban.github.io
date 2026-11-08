// The page is built by a swarm. Drones fly in from the stars, line up along each block
// on screen, and sweep across it left to right; the block appears under their beams.
// About a second and a half, then they leave and the canvas is removed. Blocks below
// the fold are simply there when you scroll to them.
//
// The <head> adds .build to <html> (not for reduced motion), which holds every .rise
// block clipped away until it is .built; .done ends that, and the <head> sets it
// after a few seconds anyway, so the words never depend on this script.
import { small } from './env.js';

const root = document.documentElement;
const STAGGER = 85, LEAD = 230, SWEEP = 380;   // ms: between blocks, fly-in, one sweep
const PER = small ? 4 : 7;                     // drones per block
const K = 340, C = 2 * Math.sqrt(K);           // a critically damped spring: no overshoot
const LAG = 2000 / Math.sqrt(K);               // ms such a spring trails a moving target by

const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const rand = (a, b) => a + Math.random() * (b - a);
// Where a block's sweep edge is at time t.
const edgeAt = (b, t) => b.x + ease(Math.min(Math.max((t - b.start) / SWEEP, 0), 1)) * b.w;

export function build() {
  if (!root.classList.contains('build') || root.classList.contains('done')) return Promise.resolve();
  const finish = () => root.classList.add('done');
  if (document.hidden) return Promise.resolve(finish());

  const vw = innerWidth, vh = innerHeight;
  const blocks = [];
  for (const el of document.querySelectorAll('.rise')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.top < vh && r.bottom > 0) blocks.push({ el, x: r.left, w: r.width, top: r.top + scrollY, h: r.height });
    else el.classList.add('built');
  }
  if (!blocks.length) return Promise.resolve(finish());

  const cv = Object.assign(document.createElement('canvas'), { className: 'swarm' });
  cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = vw * dpr; cv.height = vh * dpr;
  document.body.append(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(root);
  const accent = css.getPropertyValue('--accent').trim() || '#ff9a76';
  const ink = css.getPropertyValue('--text').trim() || '#eee';

  // Each block gets its drones, one per row, spread over the part of it on screen.
  const drones = [];
  blocks.forEach((b, i) => {
    b.start = LEAD + i * STAGGER;
    for (let j = 0; j < PER; j++) {
      drones.push({
        b, row: (j + .5) / PER, spawn: i * STAGGER * .6 + j * 12,
        x: vw + rand(20, 120), y: rand(-40, vh * .7), vx: 0, vy: 0,
        lead: rand(10, 22), lift: rand(6, 14), ph: rand(0, 6.3),
        ex: vw + rand(40, 160), ey: rand(-160, -40), gone: false,
      });
    }
  });

  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0;
    function frame(now) {
      const t = now - t0, dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      ctx.clearRect(0, 0, vw, vh);

      // Sweep each block: its clip opens up to the beams' edge.
      for (const b of blocks) {
        const p = Math.min(Math.max((t - b.start) / SWEEP, 0), 1);
        b.p = p;
        const top = b.top - scrollY;
        b.vt = Math.max(top, 0); b.vb = Math.min(top + b.h, vh);
        b.edge = edgeAt(b, t);
        b.ahead = edgeAt(b, t + LAG);            // aim where the edge will be, so the drones keep up
        if (b.built) continue;
        if (p >= 1) { b.built = true; b.el.classList.add('built'); b.el.style.clipPath = ''; continue; }
        if (p > 0) {
          b.el.style.clipPath = `inset(-12px ${(b.x + b.w - b.edge).toFixed(1)}px -12px -12px)`;
          if (b.vb > b.vt) {                     // the bright edge where the block is being laid down
            ctx.globalAlpha = .18; ctx.strokeStyle = accent; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(b.edge, b.vt); ctx.lineTo(b.edge, b.vb); ctx.stroke();
            ctx.globalAlpha = .8; ctx.lineWidth = 1.2; ctx.stroke();
          }
        }
      }

      // Move the drones: in, along the edge, then away.
      let alive = 0;
      const beams = new Path2D(), sparks = new Path2D(), arms = new Path2D(), rotors = new Path2D(), trails = new Path2D();
      for (const d of drones) {
        if (d.gone || t < d.spawn) { if (!d.gone) alive++; continue; }
        const b = d.b, ry = b.vt + d.row * Math.max(b.vb - b.vt, 1);
        const leaving = b.p >= 1;
        let tx, ty;
        if (leaving) { tx = d.ex; ty = d.ey; }
        else { tx = b.ahead + d.lead + Math.sin(t / 90 + d.ph) * 2; ty = ry - d.lift + Math.cos(t / 110 + d.ph) * 2; }
        const k = leaving ? K * 1.6 : K;
        d.vx += ((tx - d.x) * k - d.vx * C) * dt;
        d.vy += ((ty - d.y) * k - d.vy * C) * dt;
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (leaving && (d.x > vw + 20 || d.y < -20)) { d.gone = true; continue; }
        alive++;

        if (b.p > 0 && !leaving && Math.abs(tx - d.x) + Math.abs(ty - d.y) < 40) {   // in place: the beam, and its spark
          beams.moveTo(d.x, d.y + 2); beams.lineTo(b.edge, ry);
          sparks.moveTo(b.edge + 1.8, ry); sparks.arc(b.edge, ry, 1.8, 0, 6.3);
        }
        trails.moveTo(d.x, d.y); trails.lineTo(d.x - d.vx * .014, d.y - d.vy * .014);
        const s = 3.4, tilt = Math.max(-.5, Math.min(.5, d.vx / 900));
        const c = Math.cos(tilt) * s, n = Math.sin(tilt) * s;
        for (const [ax, ay] of [[c - n, n + c], [-c - n, -n + c], [c + n, n - c], [-c + n, -n - c]]) {
          arms.moveTo(d.x, d.y); arms.lineTo(d.x + ax, d.y + ay);
          rotors.moveTo(d.x + ax + 1.5, d.y + ay); rotors.arc(d.x + ax, d.y + ay, 1.5, 0, 6.3);
        }
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = accent;
      ctx.globalAlpha = .45; ctx.lineWidth = 1; ctx.stroke(beams);
      ctx.globalAlpha = .22; ctx.lineWidth = 1.5; ctx.stroke(trails);
      ctx.globalAlpha = .9; ctx.fillStyle = accent; ctx.fill(sparks);
      ctx.strokeStyle = ink; ctx.globalAlpha = .85; ctx.lineWidth = 1.1; ctx.stroke(arms);
      ctx.fillStyle = accent; ctx.globalAlpha = .95; ctx.fill(rotors);
      ctx.globalAlpha = 1;

      if (alive || blocks.some((b) => !b.built)) requestAnimationFrame(frame);
      else { cv.remove(); finish(); resolve(); }
    }
    requestAnimationFrame(frame);
  });
}
