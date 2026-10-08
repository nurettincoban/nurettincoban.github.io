// A galaxy you can play. This module wires the parts together and runs the frame loop:
//   simulation.js   the stars' physics, on the GPU
//   stars.js        drawing them
//   view.js         the camera, and mapping between the screen and the disk
//   drawing.js      strokes drawn in the sky, and their replays
//   sparks.js       the 2D overlay: the cover, the card's sparks, the cue's stars
//   perform.js      the galaxy performing Ad Astra while the video plays
//   ../audio/       the sound the drawing makes
import { WebGLRenderer, Scene, Mesh, PlaneGeometry } from 'three';
import { small, reduceMotion, $ } from '../env.js';
import { createSimulation, STEP } from './simulation.js';
import { createStars } from './stars.js';
import { createView, wide } from './view.js';
import { createDrawing } from './drawing.js';
import { createSparks } from './sparks.js';
import { createPerformer } from './perform.js';
import { createConductor } from '../audio/conductor.js';

export async function boot() {
  const sky = $('sky'), canvas = $('bg'), cue = $('hud-cue');
  const size = small ? 128 : 256;                     // 16,384 or 65,536 stars
  const quiet = reduceMotion.matches;

  let renderer = null;
  try { renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' }); } catch (e) {}
  const sim = renderer && renderer.capabilities.isWebGL2 && createSimulation(renderer, size, quiet);
  if (!sim) { sky.classList.add('off'); document.body.classList.add('nosky'); return; }   // the page is complete without it

  let dpr = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(dpr);
  const stars = createStars(sim, size, { quiet, small });
  const view = createView(renderer, canvas, sky);
  const glow = stars.uniforms.uGlow;
  let kick = 0, nova = null, cueSeen = false, ready = false;

  const draw = () => { if (ready) stars.render(renderer, view.camera); };
  const resize = () => { if (view.resize()) { stars.fit(renderer.getPixelRatio()); draw(); } };

  const sparks = createSparks({
    view, stars, coverButton: $('play'),
    onArrive(what) {
      if (what === 'cover') { sim.shock([0, 0, 0], 1); kick = 1; glow.value = Math.max(glow.value, 1.2); }   // the song is in
      else kick = Math.max(kick, 0.25);
    },
  });
  const drawing = createDrawing(sky, view, {
    onStart() {
      conductor.begin();
      if (!cueSeen) { cueSeen = true; setTimeout(() => { cue.style.opacity = 0.4; }, 3000); }   // the cue steps back
    },
    onRelease(p) { nova = p; },
  });
  const conductor = createConductor(drawing, $('sound'));
  const performer = createPerformer({ sim, glow, onKick: () => sparks.fromCover(4) });

  addEventListener('cover', (e) => sparks.coverBurst(e.detail.img, e.detail.x, e.detail.y));
  addEventListener('music', (e) => {
    conductor.silenced = e.detail.playing;
    performer.follow(e.detail.playing ? e.detail.time : null);
  });
  addEventListener('themechange', () => { stars.syncTheme(); draw(); });
  new ResizeObserver(resize).observe(sky);
  // Until the first stroke, the cue sheds a few stars into the galaxy every few seconds.
  setInterval(() => { if (!cueSeen && running && !document.hidden) sparks.fromElement(cue); }, 2800);

  // ---- the frame loop: physics at a fixed 60 Hz, drawn only when it stepped ----
  let running = false, visible = true, last = 0, acc = 0;
  let drawn = 0, elapsed = 0, gapMax = 0, slow = 0;

  function frame(now) {
    if (!running) return;
    const gap = (now - last) / 1000, dt = Math.min(gap, 0.1);
    last = now;

    // The melody's real notes, as they sound, light the stars where the pen (or a
    // replaying stroke) is, and leave the Ad Astra card toward it.
    for (const note of conductor.notesPassed()) {
      const c = drawing.control, level = (0.3 + 0.7 * c.v) * c.gain;
      sim.shock(c.p, (0.05 + note.vel * 0.12) * level);
      const pen = drawing.drawing && drawing.pen;
      const [x, y] = pen ? [pen.x, pen.y] : view.toScreen(c.p);
      sparks.fromCard(x, y, level);
      kick = Math.max(kick, 0.4 * level);
    }
    if (nova) { sim.shock(nova, 0.7); nova = null; }
    kick *= Math.exp(-dt * 8);
    let k = kick * 0.8;
    if (performer.active) k = Math.max(k, performer.frame(now / 1000));
    else glow.value *= Math.exp(-dt * 2);
    sim.uniforms.uKick.value = k;

    // Wells: the pen (or a gentle pull under a hovering mouse), then the replays.
    const W = sim.wells, hover = drawing.hover;
    if (drawing.drawing && drawing.penOnDisk) W[0].set(...drawing.penOnDisk, 3.2);
    else if (hover && wide()) { const p = view.onDisk(hover[0], hover[1]); W[0].set(p ? p[0] : 0, 0, p ? p[2] : 0, p ? 0.9 : 0); }
    else W[0].w = 0;
    for (let i = 0; i < 3; i++) { const h = drawing.heads[i]; if (h) W[i + 1].set(...h.p, 2.2); else W[i + 1].w = 0; }

    view.update(dt);
    stars.uniforms.uIntro.value = Math.min(stars.uniforms.uIntro.value + dt / 1.2, 1);

    // At most three steps a frame: a slow frame slows the sky, it never breaks it.
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 3) { sim.step(); acc -= STEP; n++; }
    if (n === 3) acc = 0;
    if (n > 0) { draw(); drawn++; }

    // One fallback: if the GPU genuinely struggles for three seconds, one pixel per CSS
    // pixel. A throttled page (a hidden pane, a gap of 200 ms or more) is not a
    // struggling GPU, and stars are never taken away.
    elapsed += dt; gapMax = Math.max(gapMax, gap);
    if (elapsed >= 0.5) {
      slow = gapMax > 0.2 ? 0 : drawn / elapsed < 40 ? slow + 1 : 0;
      if (slow >= 6 && dpr > 1) { dpr = 1; renderer.setPixelRatio(1); resize(); slow = 0; }
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

  // Compile every shader before the first frame, in parallel and off the main thread
  // where the browser supports it (KHR_parallel_shader_compile). Compiling on first use
  // froze the page for over half a second while it loaded.
  const warm = new Scene(), plane = new PlaneGeometry(2, 2);
  warm.add(...sim.materials.map((m) => new Mesh(plane, m)));
  try { await renderer.compileAsync(warm, view.camera); await renderer.compileAsync(stars.scene, view.camera); } catch (e) {}
  plane.dispose();
  ready = true;

  stars.syncTheme();
  resize();
  if (quiet) { for (let i = 0; i < 240; i++) sim.step(); draw(); }
  canvas.classList.add('on');
  $('hud').classList.add('on');
  start();
}
