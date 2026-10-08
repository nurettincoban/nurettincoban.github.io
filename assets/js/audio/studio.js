// The studio: the two Ad Astra loops and the chain they play through.
//
//   melody ─ level ─ lowpass ─ 3D position ─┐
//      └──── ping-pong delay, hall reverb ───┤
//   pad ──── level ─ lowpass ────────────────┤
//                                           sum ─ high-pass ─ low shelf ─ air shelf
//                                               ─ glue compressor ─ saturation ─ limiter ─ out
import { small } from '../env.js';
import { BPM, LOOP, asset } from './ad-astra.js';

export function createStudio() {
  const ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  const sr = ac.sampleRate;
  const gain = (v, to) => { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const filter = (type, f, q) => {
    const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (q !== undefined) b.Q.value = q;
    return b;
  };

  // ---- master
  const out = gain(0); out.connect(ac.destination);
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -2.5; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.001; limiter.release.value = 0.08;
  limiter.connect(out);
  const sat = ac.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) { const x = i / 1023.5 - 1; curve[i] = Math.tanh(1.3 * x) / Math.tanh(1.3); }
  sat.curve = curve; sat.oversample = small ? 'none' : '2x'; sat.connect(limiter);
  const glue = ac.createDynamicsCompressor();
  glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 2.5;
  glue.attack.value = 0.012; glue.release.value = 0.18;
  glue.connect(sat);
  const air = filter('highshelf', 9000); air.gain.value = 2; air.connect(glue);
  const low = filter('lowshelf', 110); low.gain.value = 1.5; low.connect(air);
  const hp = filter('highpass', 28, 0.7); hp.connect(low);
  const sum = gain(0.8, hp);

  // ---- hall reverb, built from scratch: early reflections, then a stereo tail that
  // gets darker as it dies away, as real rooms do.
  function hall(seconds) {
    const len = Math.floor(sr * seconds), b = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        y += (0.85 - 0.75 * t) * ((Math.random() * 2 - 1) - y);   // a lowpass closing over time
        d[i] = y * Math.pow(1 - t, 2.4);
      }
      for (let k = 0; k < 9; k++) {                                // early reflections, per ear
        d[Math.floor(sr * (0.008 + Math.random() * 0.07))] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - k * 0.04);
      }
    }
    return b;
  }
  const revIn = gain(1), revHP = filter('highpass', 220, 0.6);
  const pre = ac.createDelay(0.1); pre.delayTime.value = 0.024;
  const conv = ac.createConvolver(); conv.buffer = hall(small ? 2.4 : 3.4);
  revIn.connect(revHP); revHP.connect(pre); pre.connect(conv); conv.connect(gain(0.55, sum));

  // ---- ping-pong delay, a dotted eighth, darker each repeat
  const dIn = gain(1), dHP = filter('highpass', 280, 0.6), dLP = filter('lowpass', 3600, 0.6);
  const dl = ac.createDelay(2), dr = ac.createDelay(2), fb = gain(0.36), merge = ac.createChannelMerger(2);
  dl.delayTime.value = dr.delayTime.value = 60 / BPM * 0.75;
  const dOut = gain(0.45, sum); dOut.connect(revIn);
  dIn.connect(dHP); dHP.connect(dl); dl.connect(dr); dr.connect(dLP); dLP.connect(fb); fb.connect(dl);
  dl.connect(merge, 0, 0); dr.connect(merge, 0, 1); merge.connect(dOut);

  // ---- the two voices
  const melAmp = gain(0), melTone = filter('lowpass', 900, 0.8);
  let melPan;
  try {
    if (small) throw 0;
    melPan = new PannerNode(ac, { panningModel: 'HRTF', distanceModel: 'linear', rolloffFactor: 0, positionZ: -2 });
  } catch (e) { melPan = new StereoPannerNode(ac); }
  melAmp.connect(melTone); melTone.connect(melPan); melPan.connect(sum);
  melTone.connect(gain(0.3, dIn)); melTone.connect(gain(0.38, revIn));
  const padAmp = gain(0), padTone = filter('lowpass', 1400, 0.6);
  padAmp.connect(padTone); padTone.connect(sum); padTone.connect(gain(0.4, revIn));

  // ---- the loops. MP3 encoders put a few milliseconds of silence before the audio, and
  // decoders differ in whether they remove it; so each file begins with a lead-in holding
  // a one-sample marker, and finding it tells us exactly where the loop begins. The loops
  // then run sample-accurately, melody and pad locked together.
  const loops = {};
  const ready = Promise.all(['melody', 'pad'].map((name) =>
    fetch(asset(`assets/audio/ad-astra-${name}.mp3`))
      .then((r) => r.arrayBuffer())
      .then((b) => new Promise((ok, no) => ac.decodeAudioData(b, ok, no)))
      .then((buf) => {
        const d = buf.getChannelData(0), end = Math.min(d.length, Math.floor(buf.sampleRate * 0.3));
        let at = 0;
        for (let i = 1; i < end; i++) if (Math.abs(d[i]) > Math.abs(d[at])) at = i;
        loops[name] = { buf, from: at / buf.sampleRate - LOOP.marker + LOOP.leadIn };
      })));

  let sources = null, origin = 0;
  function start() {
    if (sources || !loops.melody || !loops.pad) return;
    origin = ac.currentTime + 0.03;
    sources = ['melody', 'pad'].map((name) => {
      const { buf, from } = loops[name], src = ac.createBufferSource();
      src.buffer = buf; src.loop = true; src.loopStart = from; src.loopEnd = from + LOOP.length;
      src.connect(name === 'melody' ? melAmp : padAmp);
      src.start(origin, from);
      return src;
    });
  }
  function stop() { if (sources) { sources.forEach((s) => s.stop()); sources = null; } }

  // Seconds into the loop, or -1 when stopped.
  const position = () => (sources ? (((ac.currentTime - origin) % LOOP.length) + LOOP.length) % LOOP.length : -1);

  // How the loops sound: melody and pad level (0..1), brightness (0..1), and where the
  // melody sits around the listener (degrees).
  function steer(mel, pad, bright, az, el) {
    const now = ac.currentTime;
    melAmp.gain.setTargetAtTime(mel * LOOP.melodyGain * 1.25, now, mel > 0.01 ? 0.06 : 0.5);
    padAmp.gain.setTargetAtTime(pad * LOOP.padGain * 2.6, now, pad > 0.01 ? 0.6 : 1.6);
    melTone.frequency.setTargetAtTime(300 * Math.pow(2, bright * 5.5), now, 0.08);   // 300 Hz to 13.6 kHz
    padTone.frequency.setTargetAtTime(500 * Math.pow(2, bright * 3), now, 0.4);
    if (melPan.positionX) {
      const r = az * Math.PI / 180, e = el * Math.PI / 180;
      melPan.positionX.setTargetAtTime(2 * Math.sin(r) * Math.cos(e), now, 0.08);
      melPan.positionY.setTargetAtTime(2 * Math.sin(e), now, 0.08);
      melPan.positionZ.setTargetAtTime(-2 * Math.cos(r) * Math.cos(e), now, 0.08);
    } else melPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, az / 80)), now, 0.08);
  }

  return { ac, out, ready, start, stop, position, steer, playing: () => !!sources };
}
