// The page itself: the theme switch, the email address, and the name.
import { reduceMotion, $ } from './env.js';

const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
$('year').textContent = new Date().getFullYear();

// ---- theme. The new theme spreads from the button as a circle (View Transitions).
// Anything that paints in the page's colours listens for 'themechange'.
const theme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
function setTheme(next) {
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) {}
  dispatchEvent(new Event('themechange'));
}
$('theme').addEventListener('click', (e) => {
  const next = theme() === 'dark' ? 'light' : 'dark';
  if (!document.startViewTransition || reduceMotion.matches) return setTheme(next);
  const x = e.clientX || innerWidth - 37, y = e.clientY || 37;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(() => setTheme(next)).ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
});
systemDark.addEventListener('change', () => { if (!root.dataset.theme) dispatchEvent(new Event('themechange')); });

// ---- email. Assembled here, so the address is not sitting in the HTML for scrapers.
const mail = $('email'), address = `${mail.dataset.u}@${mail.dataset.d}`;
mail.href = `mailto:${address}`;
const copy = $('copy');
copy.addEventListener('click', () => {
  const label = copy.querySelector('span');
  navigator.clipboard.writeText(address).then(() => {
    label.textContent = 'Copied!'; label.hidden = false;
    setTimeout(() => { label.hidden = true; }, 1600);
  }, () => { location.href = mail.href; });
});

// ---- the name. Its letters settle left to right, on load and on hover.
const name = $('name'), text = name.textContent, glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+=<>/\\01';
let scrambling = false;
function scramble() {
  if (scrambling || reduceMotion.matches) return;
  scrambling = true;
  const start = performance.now();
  (function step(now) {
    const p = Math.min((now - start) / 700, 1);
    name.textContent = [...text].map((c, i) => (c === ' ' || i / text.length < p ? c : glyphs[(Math.random() * glyphs.length) | 0])).join('');
    if (p < 1) requestAnimationFrame(step); else { name.textContent = text; scrambling = false; }
  })(start);
}
name.addEventListener('pointerenter', scramble);
setTimeout(scramble, 400);
