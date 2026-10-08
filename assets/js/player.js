// The Ad Astra card. Its YouTube player loads only when someone presses play. The
// galaxy hears about it through two events: 'cover' (take the cover apart) and 'music'
// (playing or not, with a function returning the player's position in seconds).
import { $ } from './env.js';

const VIDEO = '5mYk19IsFmE';
const play = $('play'), card = $('track');

play.addEventListener('click', (e) => {
  dispatchEvent(new CustomEvent('cover', { detail: { img: play.querySelector('img'), x: e.clientX, y: e.clientY } }));
  play.disabled = true;
  $('player-wrap').hidden = false;
  $('dock').classList.add('open');
  window.onYouTubeIframeAPIReady = () => new YT.Player('player', {
    videoId: VIDEO,
    host: 'https://www.youtube-nocookie.com',
    playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: (ev) => ev.target.playVideo(),
      onStateChange: (ev) => {
        const playing = ev.data === 1;
        card.classList.toggle('playing', playing);
        dispatchEvent(new CustomEvent('music', { detail: { playing, time: () => ev.target.getCurrentTime() } }));
      },
    },
  });
  document.head.append(Object.assign(document.createElement('script'), { src: 'https://www.youtube.com/iframe_api' }));
});
