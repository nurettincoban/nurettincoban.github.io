// The overlay the page's pieces fly through on their way into the galaxy:
//   - the Ad Astra cover, taken apart when someone presses play: its tiles leave in a
//     ripple from the press, arc across the page shrinking into points of light, and
//     fall into the core;
//   - sparks from the cover on every kick while the track plays, and from the card to
//     the pen on every note drawn in the sky;
//   - a few stars shed by the "draw in the stars" cue until the first stroke.
// A plain 2D canvas at one pixel per CSS pixel, running only while something flies.
import { small, reduceMotion } from '../env.js';

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function createSparks({ view, stars, coverButton, onArrive }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  let sparks = [], running = false, coverImg = null, landed = 0, burstSize = 0;

  function launch(s) {
    sparks.push(s);
    if (!running) {
      running = true;
      canvas.width = innerWidth; canvas.height = innerHeight;
      requestAnimationFrame(frame);
    }
  }
  const onScreen = (box) => box.bottom >= 0 && box.top <= innerHeight;

  function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const [cx, cy] = view.toScreen([0, 0, 0]);
    ctx.globalCompositeOperation = stars.light ? 'source-over' : 'lighter';
    ctx.fillStyle = stars.accent;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i], t = (now - s.t0) / 1000 - s.delay;
      if (t < 0) {                                       // still waiting its turn in the ripple
        if (s.sx !== undefined) ctx.drawImage(coverImg, s.sx, s.sy, s.ss, s.ss, s.x0 - s.size / 2, s.y0 - s.size / 2, s.size, s.size);
        continue;
      }
      const u = Math.min(t / s.dur, 1), e = ease(u);
      // A quadratic curve whose control point sits off to one side: every piece arcs.
      const tx = s.tx ?? cx, ty = s.ty ?? cy;
      const mx = (s.x0 + tx) / 2 + s.bend * 0.5, my = (s.y0 + ty) / 2 - Math.abs(s.bend) * 0.35;
      const x = (1 - e) * (1 - e) * s.x0 + 2 * (1 - e) * e * mx + e * e * tx;
      const y = (1 - e) * (1 - e) * s.y0 + 2 * (1 - e) * e * my + e * e * ty;
      const size = s.size + (1.6 - s.size) * Math.min(1, e * 1.4);
      ctx.globalAlpha = 1 - Math.max(0, (u - 0.82) / 0.18);
      if (s.sx !== undefined && size > 2.4) {
        ctx.save();
        ctx.translate(x, y); ctx.rotate(s.spin * e * Math.PI / 180);
        ctx.drawImage(coverImg, s.sx, s.sy, s.ss, s.ss, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x, y, Math.max(size, 1.2) / 2 + 0.4, 0, Math.PI * 2); ctx.fill();
      }
      if (u >= 1) {
        sparks.splice(i, 1);
        if (s.burst) { if (++landed === Math.floor(burstSize * 0.9)) onArrive('cover'); }
        else if (!s.quiet) onArrive('spark');
      }
    }
    ctx.globalAlpha = 1;
    if (sparks.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  return {
    // The cover comes apart and falls into the galaxy.
    coverBurst(img, px, py) {
      if (reduceMotion.matches || !img.complete || !img.naturalWidth) return;
      coverImg = img;
      const box = img.parentElement.getBoundingClientRect();
      // The visible square of the thumbnail: object-fit: cover, then scaled 1.36 in CSS.
      const side = Math.min(img.naturalWidth, img.naturalHeight) / 1.36;
      const sx0 = (img.naturalWidth - side) / 2, sy0 = (img.naturalHeight - side) / 2;
      const G = small ? 14 : 22, cell = box.width / G, scell = side / G, t0 = performance.now();
      const far = Math.hypot(box.width, box.height);
      for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
        const x = box.left + (i + 0.5) * cell, y = box.top + (j + 0.5) * cell;
        launch({
          sx: sx0 + i * scell, sy: sy0 + j * scell, ss: scell, x0: x, y0: y, size: cell + 0.6, t0,
          delay: Math.hypot(x - px, y - py) / far * 0.55 + Math.random() * 0.12, dur: 1.15 + Math.random() * 0.75,
          bend: (Math.random() - 0.5) * 420, spin: (Math.random() - 0.5) * 140, burst: true,
        });
      }
      burstSize = G * G; landed = 0;
      img.style.transition = 'opacity .3s'; img.style.opacity = '0';
      setTimeout(() => { img.style.transition = 'opacity 1.4s'; img.style.opacity = '1'; }, 2800);
    },
    // A few sparks from the edges of the cover into the core (on a kick).
    fromCover(count) {
      if (reduceMotion.matches || !coverImg) return;
      const box = coverImg.parentElement.getBoundingClientRect();
      if (!onScreen(box)) return;
      const t0 = performance.now();
      for (let k = 0; k < count; k++) {
        const edge = Math.random() * 4, u = edge % 1;
        launch({
          x0: box.left + (edge < 1 ? u : edge < 2 ? 1 : edge < 3 ? 1 - u : 0) * box.width,
          y0: box.top + (edge < 1 ? 0 : edge < 2 ? u : edge < 3 ? 1 : 1 - u) * box.height,
          size: 3.2, t0, delay: k * 0.03, dur: 1.0 + Math.random() * 0.5, bend: (Math.random() - 0.5) * 300, spin: 0,
        });
      }
    },
    // A note drawn in the sky visibly leaves the card: two sparks fly from the cover to
    // (tx, ty), and the cover gives a small pulse.
    fromCard(tx, ty, level) {
      if (reduceMotion.matches) return;
      const box = coverButton.getBoundingClientRect();
      if (!onScreen(box)) return;
      const t0 = performance.now();
      for (let k = 0; k < 2; k++) {
        launch({
          x0: box.left + box.width * (0.3 + Math.random() * 0.4), y0: box.top + box.height * (0.3 + Math.random() * 0.4),
          tx, ty, size: 2.6 + level * 1.6, t0, delay: k * 0.04, dur: 0.55 + Math.random() * 0.25,
          bend: (Math.random() - 0.5) * 260, spin: 0,
        });
      }
      coverButton.animate([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
    },
    // Three quiet stars drifting from an element into the core.
    fromElement(el) {
      if (reduceMotion.matches) return;
      const b = el.getBoundingClientRect();
      if (!b.width || !onScreen(b)) return;
      const t0 = performance.now();
      for (let k = 0; k < 3; k++) {
        launch({
          x0: b.left + Math.random() * b.width, y0: b.top + b.height / 2, size: 2.2, t0, delay: k * 0.18,
          dur: 1.4 + Math.random() * 0.6, bend: (Math.random() - 0.5) * 240, spin: 0, quiet: true,
        });
      }
    },
  };
}
