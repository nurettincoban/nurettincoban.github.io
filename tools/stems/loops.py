"""Cut the two seamless loops the page plays when someone draws in the sky.

    python tools/stems/loops.py <stems folder> assets/audio

Eight bars from bar 48 of the stem mix (bars 49–56, counting from one): the melody,
and the pad beneath it (atmosphere + pad fx). Needs numpy and ffmpeg on the PATH.

Each loop's end is crossfaded into the audio that leads into its start, so wrapping
from the last sample to the first is continuous. Each file then gets a 0.1 s lead-in
holding a one-sample marker at 0.05 s, and 0.3 s of the loop's head after its end:
MP3 encoders add a little silence at the start and decoders differ in removing it, so
the page finds the marker to know exactly where the loop begins.

Prints the gains that undo the normalisation; they belong in LOOP in
assets/js/audio/ad-astra.js.
"""
import json
import os
import subprocess
import sys

import numpy as np

from wav import read, write16
from score import path

BPM, BEAT0, BAR = 122.0, 0.0049, 48           # from score.py: tempo, first beat, first bar
PERIOD = 60 / BPM
START = BEAT0 + BAR * 4 * PERIOD
LENGTH = 32 * PERIOD
LOOPS = {                                       # name: (stems, crossfade in s, LAME VBR quality)
    'melody': (['melody'], 0.08, 4),
    'pad': (['atmosphere', '28 pancar engine padfx'], 0.25, 6),
}


def loop_of(x, rate, xfade):
    s, n, c = int(round(START * rate)), int(round(LENGTH * rate)), int(xfade * rate)
    y = x[s:s + n].copy()
    w = np.linspace(0, 1, c, dtype=np.float32)[:, None]
    y[n - c:] = y[n - c:] * np.cos(w * np.pi / 2) + x[s - c:s] * np.sin(w * np.pi / 2)   # equal power
    return y


def main(folder, outdir):
    os.makedirs(outdir, exist_ok=True)
    gains = {}
    for name, (stems, xfade, quality) in LOOPS.items():
        y = None
        for stem in stems:
            x, rate = read(path(folder, stem), mono=False)
            piece = loop_of(x, rate, xfade)
            y = piece if y is None else y + piece
        peak = float(np.abs(y).max())
        y *= 0.89 / peak                                  # encode near full scale ...
        gains[name + 'Gain'] = round(peak / 0.89, 5)      # ... and say how to undo it
        lead = np.zeros((int(0.1 * rate), 2), np.float32)
        lead[int(0.05 * rate)] = 0.9
        wav = os.path.join(outdir, name + '.wav')
        write16(wav, np.vstack([lead, y, y[: int(0.3 * rate)]]), rate)
        mp3 = os.path.join(outdir, f'ad-astra-{name}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-q:a', str(quality), mp3], check=True)
        os.remove(wav)
        print(f'{mp3}: {os.path.getsize(mp3) // 1024} KB')
    print(json.dumps({'length': round(LENGTH, 6), 'start': round(START, 4), **gains}))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
