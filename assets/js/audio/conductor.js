// The music drawn in the sky. Owns the studio (created on the first stroke: browsers
// allow sound only after a gesture) and the sound button, and twenty times a second
// turns whoever is in control — the pen, or the newest replaying stroke — into how the
// Ad Astra loops sound. Also reports the melody's real notes as they pass, so the
// galaxy can light up on them.
import { createStudio } from './studio.js';
import { loadScore, notesInLoop } from './ad-astra.js';

// Output level after the limiter: 7.5 dB under full scale, so the page never plays
// louder than whatever else the visitor is listening to.
const LEVEL = 0.9 * 10 ** (-7.5 / 20);

export function createConductor(drawing, button) {
  let studio = null, muted = false, silenced = false, timer = 0, quietSince = 0;
  let notes = [], lastPos = 0;

  try { muted = localStorage.getItem('sound') === 'off'; } catch (e) {}
  const show = () => {
    button.setAttribute('aria-pressed', String(!muted));
    button.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute');
  };
  const level = () => {
    if (studio) studio.out.gain.setTargetAtTime(muted || silenced ? 0 : LEVEL, studio.ac.currentTime, 0.05);
  };
  show();
  button.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem('sound', muted ? 'off' : 'on'); } catch (e) {}
    show(); level();
  });

  function steer() {
    const c = drawing.update(), now = performance.now() / 1000;
    if (!studio) return;
    if (c) {
      quietSince = now;
      studio.steer((0.3 + 0.7 * c.v) * c.gain, 1, 1 - c.y, (c.x * 2 - 1) * 70, (1 - c.y) * 40 - 8);
    } else {
      studio.steer(0, 0, 0.4, 0, 0);
      // Twelve quiet seconds: stop the loops and this timer; nothing runs until the next stroke.
      if (now - quietSince > 12) { studio.stop(); clearInterval(timer); timer = 0; }
    }
  }

  return {
    // A stroke has begun.
    begin() {
      if (!studio) {
        studio = createStudio(); level();
        studio.ready.then(() => { if (drawing.busy()) studio.start(); }).catch(() => {});
        loadScore().then((s) => { notes = notesInLoop(s); });
      }
      if (studio.ac.state !== 'running') studio.ac.resume();
      studio.start();
      quietSince = performance.now() / 1000;
      if (!timer) timer = setInterval(steer, 50);
    },
    // While the Ad Astra video plays, the drawn music keeps quiet.
    set silenced(on) { silenced = on; level(); },
    stop() { if (studio) studio.stop(); },
    // The melody notes that sounded since the last call, while someone is playing.
    notesPassed() {
      if (!studio || !drawing.control || !notes.length) return [];
      const pos = studio.position();
      if (pos < 0) return [];
      const wrap = pos < lastPos;
      const passed = notes.filter((n) => (wrap ? n.t > lastPos || n.t <= pos : n.t > lastPos && n.t <= pos));
      lastPos = pos;
      return passed;
    },
  };
}
