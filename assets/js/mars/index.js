// Mars, behind the page: the Ad Astra cover as a canyon you can play. This module wires
// the parts together and runs the frame loop:
//   scene.js      the cover in layers, its light and its dust
//   drawing.js    strokes drawn in the air, and their replays
//   sparks.js     the 2D overlay: the cover, the card's sparks, the cue's sparks
//   perform.js    the score, followed while the video plays
//   ../audio/     the sound the drawing makes
// The pen is a light: it shines on the rock and gathers the dust. Notes flash where
// they sound, the beat pushes the camera, and what leaves the card falls into the visor.
import { WebGLRenderer } from 'three';
import { small, wide, reduceMotion, $ } from '../env.js';
import { createScene, LIGHTS } from './scene.js';
import { createDrawing } from './drawing.js';
import { createSparks } from './sparks.js';
import { createPerformer } from './perform.js';
import { createConductor } from '../audio/conductor.js';

export async function boot() {
  const sky = $('sky'), canvas = $('bg'), cue = $('hud-cue');
  const off = () => { sky.classList.add('off'); document.body.classList.add('nosky'); };   // the page is complete without it

  let renderer = null;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) {}
  if (!renderer || !renderer.capabilities.isWebGL2) return off();
  let dpr = Math.min(devicePixelRatio, small ? 2 : 1.5);
  renderer.setPixelRatio(dpr);
  let mars;
  try { mars = await createScene(renderer, canvas, sky, { motes: small ? 500 : 900 }); } catch (e) { return off(); }

  // The lights: the pen (or a faint one under a hovering mouse), three replaying
  // strokes, and four that flash and fade.
  const L = mars.lights, FLASH = 4;
  let nextFlash = FLASH, cueSeen = false;
  const flash = (p, w) => { L[nextFlash].set(p[0], p[1], p[2], Math.max(L[nextFlash].w, w)); nextFlash = nextFlash + 1 < LIGHTS ? nextFlash + 1 : FLASH; };
  const nova = (w) => { flash(mars.visor, 4 * w); mars.kick = Math.max(mars.kick, w); mars.glow.value = Math.max(mars.glow.value, 1.2 * w); };

  const frameOnce = () => mars.render(performance.now() / 1000, 0);
  const resize = () => { if (mars.resize() && !running) frameOnce(); };

  // Everything that flies across the page lands in the astronaut's visor.
  const sparks = createSparks({
    view: { toScreen: (p) => mars.toScreen(p[0] || p[1] || p[2] ? p : mars.visor) },
    stars: {
      get light() { return getComputedStyle(document.documentElement).colorScheme.trim() !== 'dark' && !wide(); },
      get accent() { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); },
    },
    coverButton: $('play'),
    onArrive(what) { if (what === 'cover') nova(1); else mars.kick = Math.max(mars.kick, 0.25); },   // the song is in
  });
  const drawing = createDrawing(sky, { onDisk: (x, y) => mars.under(x, y) }, {
    onStart() {
      conductor.begin();
      if (!cueSeen) { cueSeen = true; setTimeout(() => { cue.style.opacity = 0.4; }, 3000); }   // the cue steps back
    },
    onRelease(p) { if (p) flash(p, 3); },
  });
  const conductor = createConductor(drawing, $('sound'));
  // The score was written for a disk: a note's angle is its pitch class, its distance
  // from the core its octave. Here the same note lands around the astronaut.
  const performer = createPerformer({
    sim: {
      shock(p, w) {
        if (!p[0] && !p[2]) return nova(w);
        const [cx, cy] = mars.toScreen(mars.visor), r = Math.min(innerWidth, innerHeight) * 0.04;
        flash(mars.under(cx + p[0] * r, cy - p[2] * r * 0.7), w * 9);
      },
    },
    glow: mars.glow, onKick: () => sparks.fromCover(4),
  });

  addEventListener('cover', (e) => sparks.coverBurst(e.detail.img, e.detail.x, e.detail.y));
  addEventListener('music', (e) => {
    conductor.silenced = e.detail.playing;
    performer.follow(e.detail.playing ? e.detail.time : null);
  });
  addEventListener('themechange', () => { mars.syncTheme(); if (!running) frameOnce(); });
  new ResizeObserver(resize).observe(sky);
  new ResizeObserver(resize).observe(document.querySelector('main'));
  // Until the first stroke, the cue sheds a few sparks toward the astronaut every few seconds.
  setInterval(() => { if (!cueSeen && running && !document.hidden) sparks.fromElement(cue); }, 2800);

  // ---- the frame loop ----
  let running = false, visible = true, last = 0;
  let drawn = 0, elapsed = 0, gapMax = 0, slow = 0;

  function frame(now) {
    if (!running) return;
    const gap = (now - last) / 1000, dt = Math.min(gap, 0.1);
    last = now;

    // The melody's real notes, as they sound, flash where the pen (or a replaying
    // stroke) is, and leave the Ad Astra card toward it.
    for (const note of conductor.notesPassed()) {
      const c = drawing.control, level = (0.3 + 0.7 * c.v) * c.gain;
      flash(c.p, (0.6 + note.vel * 1.4) * level);
      const pen = drawing.drawing && drawing.pen;
      const [x, y] = pen ? [pen.x, pen.y] : mars.toScreen(c.p);
      sparks.fromCard(x, y, level);
      mars.kick = Math.max(mars.kick, 0.4 * level);
    }
    mars.kick *= Math.exp(-dt * 8);
    if (performer.active) mars.kick = Math.max(mars.kick, performer.frame(now / 1000) * 0.8);
    else mars.glow.value *= Math.exp(-dt * 2);

    // The pen, then the replays: each a light on the rock and a pull on the dust.
    const hover = drawing.hover, W = mars.wells;
    if (drawing.drawing && drawing.penOnDisk) { L[0].set(...drawing.penOnDisk, 2.2); W[0].set(...drawing.penOnDisk, 1); }
    else if (hover && wide()) { L[0].set(...mars.under(hover[0], hover[1]), 0.55); W[0].set(...L[0].toArray().slice(0, 3), 0.3); }
    else { L[0].w = 0; W[0].w = 0; }
    for (let i = 0; i < 3; i++) {
      const h = drawing.heads[i];
      if (h) { L[i + 1].set(...h.p, 1.5 * h.gain); W[i + 1].set(...h.p, 0.8); } else { L[i + 1].w = 0; W[i + 1].w = 0; }
    }
    for (let i = FLASH; i < LIGHTS; i++) L[i].w *= Math.exp(-dt * 5);

    mars.render(now / 1000, dt);
    drawn++;

    // One fallback: if the GPU genuinely struggles for three seconds, one pixel per CSS
    // pixel. A throttled page (a hidden pane, a gap of 200 ms or more) is not a
    // struggling GPU.
    elapsed += dt; gapMax = Math.max(gapMax, gap);
    if (elapsed >= 0.5) {
      slow = gapMax > 0.2 ? 0 : drawn / elapsed < 40 ? slow + 1 : 0;
      if (slow >= 6 && dpr > 1) { dpr = 1; renderer.setPixelRatio(1); mars.resize(); slow = 0; }
      drawn = 0; elapsed = 0; gapMax = 0;
    }
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || !visible || document.hidden || reduceMotion.matches) return;
    running = true; last = performance.now();
    requestAnimationFrame(frame);
  }
  const stop = () => { running = false; };
  // Nothing runs while the sky is off screen (phones scroll it away) or the tab is hidden.
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }).observe(sky);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); drawing.cancel(); conductor.stop(); } else start();
  });
  reduceMotion.addEventListener('change', () => (reduceMotion.matches ? stop() : start()));

  // Compile the shaders before the first frame, off the main thread where the browser
  // supports it (KHR_parallel_shader_compile).
  try { await renderer.compileAsync(mars.scene, mars.camera); } catch (e) {}

  mars.syncTheme();
  mars.resize();
  frameOnce();                 // with reduced motion this still frame is the whole of it
  canvas.classList.add('on');
  $('hud').classList.add('on');
  start();
}
