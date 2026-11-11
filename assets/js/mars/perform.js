// While the Ad Astra video plays, the scene performs the track. YouTube shares the
// playback position but never the audio, so the score — analysed offline from the
// stems — is played against the video's own clock, and pausing and seeking stay in sync:
//   - the returned kick follows the kick drum, and the bass on the off-beats;
//   - build-ups and pads raise the glow;
//   - the bar where the drums slam back in is a drop: sim.shock at the origin, full strength;
//   - every melody note is a sim.shock at its own place on a disk: the angle is its
//     pitch class, the distance from the centre its octave. The caller decides what a
//     shock looks like (mars/index.js: a flash of light in the canyon).
// The score is timed to the stem mix; the released edit is about 16 s shorter, and
// OFFSET is where to correct for it if the two drift apart.
import { BPM, loadScore } from '../audio/ad-astra.js';

const OFFSET = 0;
const digit = (str, i) => (i >= 0 && i < str.length ? str.charCodeAt(i) - 48 : 0) / 9;

export function createPerformer({ sim, glow, onKick }) {
  let clock = null, score = null, anchorPos = 0, anchorAt = 0, reported = -1;
  let melIdx = 0, lastPos = -1, lastBar = -1, lastBeat = -1;

  return {
    // Follow a player's clock (a function returning seconds), or stop with null.
    follow(time) {
      clock = time; reported = -1;
      if (time) loadScore().then((s) => { score = s; });
    },
    get active() { return !!clock; },
    // How hard the beat hits right now, 0..1.
    frame(now) {
      const at = clock();
      // The player reports its position a few times a second; run a clock between reports.
      if (at !== reported) { reported = at; anchorPos = at; anchorAt = now; }
      const pos = anchorPos + (now - anchorAt) + OFFSET;
      if (!score) return Math.exp(-((((pos * BPM / 60) % 1) + 1) % 1) * 7) * 0.6;   // a plain beat until it loads

      const bf = (pos - score.beat0) * score.bpm / 60;
      const beat = Math.floor(bf), phase = bf - beat, bar = Math.floor(beat / 4);
      if (beat !== lastBeat) { lastBeat = beat; if (digit(score.kick, beat) > 0.5) onKick(); }
      glow.value += (digit(score.build, bar) * 0.8 + digit(score.pad, bar) * 0.25 - glow.value) * 0.05;
      if (bar !== lastBar) {
        if (bar === lastBar + 1 && digit(score.drums, bar) - digit(score.drums, bar - 1) > 0.5) sim.shock([0, 0, 0], 1);
        lastBar = bar;
      }
      const ms = pos * 1000, mel = score.melody;
      if (pos < lastPos - 0.5 || pos > lastPos + 2) {    // a seek: find our place in the score
        melIdx = 0;
        while (melIdx < mel.length && mel[melIdx][0] < ms) melIdx++;
      }
      lastPos = pos;
      while (melIdx < mel.length && mel[melIdx][0] <= ms) {
        const [, midi, vel] = mel[melIdx++], a = (midi % 12) / 12 * Math.PI * 2 + 0.3;
        const r = 2 + Math.max(0, Math.min(1, (midi - 48) / 36)) * 7;
        sim.shock([Math.cos(a) * r, 0, Math.sin(a) * r], 0.08 + vel / 9 * 0.16);
      }
      const kick = digit(score.kick, beat) * Math.exp(-phase * 7);
      const bass = digit(score.bass, beat) * Math.exp(-((phase + 0.5) % 1) * 9) * 0.35;
      return Math.min(1, kick + bass);
    },
  };
}
