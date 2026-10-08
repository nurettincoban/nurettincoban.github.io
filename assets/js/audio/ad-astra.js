// Ad Astra, as measured from its stems (see tools/stems): the tempo, where the loops
// were cut, and the score.

export const BPM = 122;

// The loops are bars 49–56 of the stem mix: the melody's arpeggio and the pad beneath
// it. Each file starts with a 0.1 s lead-in holding a marker at 0.05 s (see studio.js).
// The gains undo the normalisation applied when they were encoded.
export const LOOP = {
  length: 15.737705, start: 94.4311, marker: 0.05, leadIn: 0.1,
  melodyGain: 0.48211, padGain: 0.10977,
};

// Resolves a path from the site's root, wherever this module is served from.
export const asset = (path) => new URL(`../../../${path}`, import.meta.url).href;

// The score: kick and bass strength per beat; drums, pads and build-ups per bar; the
// bass root per bar; every melody note as [ms, midi, velocity 0-9]. 18 KB, fetched
// only once someone draws or presses play.
let score = null;
export function loadScore() {
  score ||= fetch(asset('assets/data/ad-astra.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .catch(() => { score = null; return null; });
  return score;
}

// The melody notes that fall inside the loops, as seconds into the loop.
export function notesInLoop(s) {
  if (!s) return [];
  const a = LOOP.start * 1000, b = a + LOOP.length * 1000;
  return s.melody.filter((n) => n[0] >= a && n[0] < b).map((n) => ({ t: (n[0] - a) / 1000, vel: n[2] / 9 }));
}
