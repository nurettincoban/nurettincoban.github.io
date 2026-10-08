// Projects, live from GitHub: public, non-fork repositories that have a description,
// most-starred first. Adding a description on GitHub is how a project gets onto this
// page, so the list never needs editing. Cached for six hours: a reload shows it at
// once and does not spend the visitor's share of GitHub's rate limit. The HTML holds a
// fallback list for when GitHub cannot be reached.
//
// Like the experience cards, each project plays a small scene of what it does; a
// repository without its own scene gets lines of code being typed.
import { tilt, playWhenVisible } from './cards.js';

const USER = 'nurettincoban', CACHE = 'repos-v1', TTL = 6 * 3600 * 1000;
const ICONS = { 'ai-prd-workflow': 'i-doc', diff2ai: 'i-diff' };

const diffRows = (y0) => [['+', 60], ['−', 44], ['', 70], ['+', 52], ['+', 36], ['−', 58], ['', 48], ['+', 64]]
  .map(([sign, w], i) => {
    const y = y0 + i * 12;
    return (sign ? `<text class="s-lbl" x="92" y="${y + 3}">${sign}</text>` : '') + `<path class="ln${sign ? '' : ' thin'}" d="M104 ${y}h${w}"/>`;
  }).join('');

const SCENES = {
  // An idea travels the pipeline and comes out as checked code.
  'ai-prd-workflow': `
    <path class="ln thin" d="M24 50H168"/>
    <circle class="ln" cx="24" cy="50" r="11"/><circle class="fl" cx="24" cy="50" r="3"/>
    <circle class="ln" cx="72" cy="50" r="11"/><path class="ln thin" d="M67 46h10M67 50h10M67 54h6"/>
    <circle class="ln" cx="120" cy="50" r="11"/><path class="ln thin" d="M114 44h8v4h-8zM118 51h8v4h-8z"/>
    <circle class="ln" cx="168" cy="50" r="11"/><path class="ln s-check" d="M162 50l4 4 8-9"/>
    <path class="s-car" pathLength="100" d="M24 50H168"/>
    <text class="s-lbl" x="15" y="76">IDEA</text><text class="s-lbl" x="65" y="76">PRD</text>
    <text class="s-lbl" x="111" y="76">RFCs</text><text class="s-lbl" x="158" y="76">CODE</text>`,
  // A diff scrolls past while a review band reads it.
  diff2ai: `
    <g class="s-scroll">${diffRows(8)}${diffRows(104)}</g>
    <rect class="s-scan" x="86" y="32" width="112" height="13" rx="3"/>
    <circle class="ln" cx="40" cy="44" r="14"/><path class="ln" d="M50 54l12 12"/><path class="ln thin" d="M33 44h14M40 37v14"/>`,
  // Anything else: lines of code being typed.
  '': `
    <rect class="fl s-type" x="80" y="24" width="70" height="5" rx="2.5"/>
    <rect class="fl s-type" style="animation-delay:.6s" x="92" y="38" width="80" height="5" rx="2.5"/>
    <rect class="fl s-type" style="animation-delay:1.2s" x="92" y="52" width="48" height="5" rx="2.5"/>
    <rect class="fl s-type" style="animation-delay:1.8s" x="80" y="66" width="60" height="5" rx="2.5"/>
    <rect class="fl s-blink" x="144" y="64" width="3" height="9"/>`,
};

function addScene(card, repo) {
  card.classList.add('has-scene');
  card.insertAdjacentHTML('beforeend', `<svg class="scene" viewBox="0 0 200 100" aria-hidden="true">${SCENES[repo] || SCENES['']}</svg>`);
  playWhenVisible(card);
}

function render(repos) {
  const shown = repos
    .filter((r) => !r.fork && !r.archived && r.description && r.name !== `${USER}.github.io`)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 6);
  if (!shown.length) return;
  const list = document.getElementById('projects');
  list.textContent = '';
  for (const r of shown) {
    const a = Object.assign(document.createElement('a'), { className: 'card', href: r.html_url, target: '_blank', rel: 'noopener' });
    const side = [r.language, r.stargazers_count > 0 ? `★ ${r.stargazers_count.toLocaleString('en')}` : ''].filter(Boolean).join(' · ');
    a.innerHTML = `<div class="card-head"><svg class="ico" aria-hidden="true"><use href="#${ICONS[r.name] || 'i-book'}"/></svg>`
      + '<span class="card-name"></span>' + (side ? '<span class="card-side"></span>' : '') + '</div><p></p>';
    a.querySelector('.card-name').textContent = r.name;
    if (side) a.querySelector('.card-side').textContent = side;
    a.querySelector('p').textContent = r.description;
    addScene(a, r.name);
    tilt(a);
    list.append(a);
  }
}

document.querySelectorAll('#projects .card[data-repo]').forEach((c) => addScene(c, c.dataset.repo));

let cached = null;
try { cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) {}
if (cached?.repos) render(cached.repos);
if (!cached || Date.now() - cached.at > TTL) {
  fetch(`https://api.github.com/users/${USER}/repos?per_page=100`)
    .then((r) => (r.ok ? r.json() : null))
    .then((repos) => {
      if (!Array.isArray(repos)) return;
      const slim = repos.map(({ name, html_url, description, language, stargazers_count, pushed_at, fork, archived }) =>
        ({ name, html_url, description, language, stargazers_count, pushed_at, fork, archived }));
      try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), repos: slim })); } catch (e) {}
      render(slim);
    })
    .catch(() => {});
}
