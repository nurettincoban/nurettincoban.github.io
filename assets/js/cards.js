// Cards tilt toward the pointer, with a soft light that follows it; and the small
// scenes inside experience and project cards play only while their card is on screen.
import { reduceMotion } from './env.js';

export function tilt(card) {
  if (reduceMotion.matches || matchMedia('(hover: none)').matches) return;
  card.addEventListener('pointermove', (e) => {
    const b = card.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
    card.style.setProperty('--rx', `${(0.5 - y) * 4}deg`);
    card.style.setProperty('--ry', `${(x - 0.5) * 6}deg`);
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  });
}

const scenes = new IntersectionObserver((entries) => {
  for (const e of entries) e.target.classList.toggle('live', e.isIntersecting);
});
export const playWhenVisible = (card) => scenes.observe(card);

document.querySelectorAll('.card').forEach(tilt);
document.querySelectorAll('.job').forEach(playWhenVisible);
