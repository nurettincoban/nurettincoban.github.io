// The Ad Astra card. Its YouTube player loads only when someone presses play, on the
// dock's cover or on the big cover in the Ad Astra section. The galaxy hears about it
// through two events: 'cover' (take the pressed cover apart) and 'music' (playing or
// not, with a function returning the player's position in seconds).
import { $ } from './env.js';

const VIDEO = '5mYk19IsFmE';
const play = $('play'), card = $('track'), astra = $('astra'), astraPlay = $('astra-play');
let started = false;

function start(img, x, y) {
  if (started) return;
  started = true;
  dispatchEvent(new CustomEvent('cover', { detail: { img, x, y } }));
  play.disabled = true;
  if (astraPlay) { astraPlay.disabled = true; astraPlay.lastChild.textContent = 'Playing'; }
  $('player-wrap').hidden = false;
  window.onYouTubeIframeAPIReady = () => new YT.Player('player', {
    videoId: VIDEO,
    host: 'https://www.youtube-nocookie.com',
    playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: (ev) => ev.target.playVideo(),
      onStateChange: (ev) => {
        const playing = ev.data === 1;
        card.classList.toggle('playing', playing);
        astra?.classList.toggle('playing', playing);
        dispatchEvent(new CustomEvent('music', { detail: { playing, time: () => ev.target.getCurrentTime() } }));
      },
    },
  });
  document.head.append(Object.assign(document.createElement('script'), { src: 'https://www.youtube.com/iframe_api' }));
}

play.addEventListener('click', (e) => start(play.querySelector('img'), e.clientX, e.clientY));
// The big cover comes apart from the button that was pressed.
astraPlay?.addEventListener('click', () => {
  const b = astraPlay.getBoundingClientRect();
  start(astra.querySelector('img'), b.left + b.width / 2, b.top + b.height / 2);
});
