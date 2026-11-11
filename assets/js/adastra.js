// The Ad Astra section: the cover drifts against the scroll and leans away from the
// pointer, so the astronaut seems to stand a little behind the page. It runs only
// while the cover is on screen, and not at all for reduced motion.
import { $, reduceMotion } from './env.js';

const fig = $('astra');
if (fig && !reduceMotion.matches) {
  let on = false, queued = false, mx = 0, my = 0;
  const paint = () => {
    queued = false;
    const r = fig.getBoundingClientRect();
    // -1 as the cover enters at the bottom of the screen, +1 as it leaves at the top.
    const p = Math.max(-1, Math.min(1, 1 - 2 * (r.top + r.height) / (innerHeight + r.height)));
    fig.style.setProperty('--py', p.toFixed(3));
    fig.style.setProperty('--mx', mx.toFixed(3));
    fig.style.setProperty('--my', my.toFixed(3));
  };
  const queue = () => { if (on && !queued) { queued = true; requestAnimationFrame(paint); } };
  new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    fig.classList.toggle('live', on);
    queue();
  }).observe(fig);
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  if (matchMedia('(hover: hover)').matches) {
    fig.addEventListener('pointermove', (e) => {
      const r = fig.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5;
      queue();
    });
    fig.addEventListener('pointerleave', () => { mx = my = 0; queue(); });
  }
}
