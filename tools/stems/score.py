"""Analyse Ad Astra's stems into assets/data/ad-astra.json, the score the page plays.

    python tools/stems/score.py <stems folder> assets/data/ad-astra.json

Only numbers come out: the tempo and first beat; kick and bass strength per beat;
drums, pads and build-ups per bar; the bass root per bar; and every melody note. No
audio is written. Needs numpy; reads 24-bit stems one at a time (about two minutes).

The stems' names are those of the v3 mix ("24092022-basstry-finale-v3-emrah-abiyle
<stem>.wav"). KASS holds the kick (tuned to G) and the bass under it, which is why
the beat grid comes from its low-band onsets.
"""
import json
import os
import sys

import numpy as np

from wav import read

PREFIX = '24092022-basstry-finale-v3-emrah-abiyle '
FPS = 100                      # envelopes at 10 ms
HOP = 441


def path(folder, stem):
    sub = 'ek' if stem[0].isdigit() else ''
    return os.path.join(folder, sub, PREFIX + stem + '.wav')


def envelopes(x, rate, nfft=2048):
    """Per 10 ms: RMS, low-band (30-150 Hz) energy, and spectral flux."""
    n = (len(x) - nfft) // HOP
    win = np.hanning(nfft).astype(np.float32)
    low = (np.fft.rfftfreq(nfft, 1 / rate) >= 30) & (np.fft.rfftfreq(nfft, 1 / rate) <= 150)
    rms, lowe, flux = (np.empty(n, np.float32) for _ in range(3))
    prev = None
    for s in range(0, n, 4096):
        e = min(n, s + 4096)
        frames = x[np.arange(s, e)[:, None] * HOP + np.arange(nfft)[None, :]] * win
        mag = np.abs(np.fft.rfft(frames, axis=1)).astype(np.float32)
        rms[s:e] = np.sqrt((frames ** 2).mean(axis=1))
        lowe[s:e] = mag[:, low].sum(axis=1)
        lm = np.log1p(mag)
        flux[s:e] = np.maximum(np.diff(np.vstack([lm[:1] if prev is None else prev[None, :], lm]), axis=0), 0).sum(axis=1)
        prev = lm[-1]
    return {'rms': rms, 'low': lowe, 'flux': flux}


def onsets(v, pct=97):
    d = np.maximum(np.diff(v, prepend=v[0]), 0)
    thr = np.percentile(d[d > 0], pct)
    return np.array([i for i in range(1, len(d) - 1) if d[i] > thr and d[i] >= d[i - 1] and d[i] >= d[i + 1]]), d


def tempo(drums, kass):
    """The tempo, from the autocorrelation of drum and kick onsets, refined on a grid."""
    def norm(v):
        v = np.maximum(v - np.convolve(v, np.ones(50) / 50, mode='same'), 0)
        return v / (v.max() + 1e-9)
    onset = norm(drums['flux']) + norm(np.diff(kass['low'], prepend=kass['low'][0]))
    ac = np.correlate(onset, onset, mode='full')[len(onset) - 1:]
    coarse = max(np.arange(100, 140.01, 0.05),
                 key=lambda bpm: sum(np.interp(60 / bpm * FPS * m, np.arange(len(ac)), ac) for m in (1, 2, 4, 8)))
    end = len(onset) / FPS
    def fit(bpm):
        beats = lambda ph: np.interp(np.arange(ph, end, 60 / bpm) * FPS, np.arange(len(onset)), onset).sum()
        return max(beats(ph) for ph in np.arange(0, 60 / bpm, 0.005))
    return round(float(max(np.arange(coarse - 1, coarse + 1, 0.01), key=fit)), 2)


def main(folder, out):
    env = {}
    for stem in ['KASS', 'Drums', 'melody', 'atmosphere', '28 pancar engine padfx',
                 'Snare perc build up', 'transitation', 'fx', 'vocal fx']:
        x, rate = read(path(folder, stem))
        env[stem] = envelopes(x, rate)
        print('read', stem)

    bpm = tempo(env['Drums'], env['KASS'])
    period = 60 / bpm

    # The first beat: the phase of the kick onsets (a circular mean, then the median of
    # what lies near it, so stray onsets do not pull it).
    kick_frames, kick_on = onsets(env['KASS']['low'])
    kt = kick_frames / FPS
    angle = np.angle(np.exp(2j * np.pi * kt / period).mean())
    guess = (angle / (2 * np.pi)) % 1 * period
    frac = ((kt - guess) / period + 0.5) % 1 - 0.5
    beat0 = (guess + np.median(frac[np.abs(frac) < 0.2]) * period) % period
    n_beats = int((len(env['KASS']['rms']) / FPS - beat0) / period)
    n_bars = n_beats // 4
    beat_t = beat0 + np.arange(n_beats) * period
    bar_t = beat0 + np.arange(n_bars) * 4 * period
    print(f'{bpm} bpm, first beat at {beat0:.4f} s, {n_bars} bars')

    def digits(values):
        v = np.asarray(values, float)
        top = np.percentile(v[v > 0], 98) if np.any(v > 0) else 1
        return ''.join(str(int(min(9, round(9 * x / top)))) for x in v)

    def window(sig, t, a, b, how):
        i0, i1 = max(int((t + a) * FPS), 0), min(int((t + b) * FPS), len(sig))
        return how(sig[i0:i1]) if i1 > i0 else 0.0

    pad = env['atmosphere']['rms'] + env['28 pancar engine padfx']['rms']
    build = sum(env[s]['rms'] for s in ['Snare perc build up', 'transitation', 'fx', 'vocal fx'])
    score = {
        'source': 'Ad Astra stems (v3 mix), analysed offline; times in seconds of that mix',
        'bpm': bpm, 'beat0': round(float(beat0), 4), 'beats': n_beats, 'bars': n_bars,
        'kick': digits([window(kick_on, t, -0.04, 0.05, np.max) for t in beat_t]),
        'bass': digits([window(env['KASS']['rms'], t, 0.2 * period, 0.95 * period, np.mean) for t in beat_t]),
        'drums': digits([window(env['Drums']['rms'], t, 0, 4 * period, np.mean) for t in bar_t]),
        'pad': digits([window(pad, t, 0, 4 * period, np.mean) for t in bar_t]),
        'build': digits([window(build, t, 0, 4 * period, np.mean) for t in bar_t]),
    }

    # The bass root of each bar: low-band chroma of KASS, skipping each kick's first 140 ms.
    x, rate = read(path(folder, 'KASS'))
    N = 8192
    fr = np.fft.rfftfreq(N, 1 / rate)
    band = (fr > 35) & (fr < 140)
    pcs = (np.round(12 * np.log2(fr[band] / 440)) + 69).astype(int) % 12
    roots = []
    for t in bar_t:
        c = np.zeros(12)
        for b in range(4):
            seg = x[int((t + b * period + 0.14) * rate):][:N]
            if len(seg) == N:
                np.add.at(c, pcs, np.abs(np.fft.rfft(seg * np.hanning(N)))[band] ** 2)
        roots.append('0123456789ab'[int(np.argmax(c))] if c.sum() > 1e-6 else 'x')
    score['root'] = ''.join(roots)

    # Melody notes: onsets of the melody stem, each with a pitch from a harmonic product spectrum.
    x, rate = read(path(folder, 'melody'))
    mel = env['melody']
    peaks, _ = onsets(mel['flux'], pct=90)
    N = 4096
    fr = np.fft.rfftfreq(N, 1 / rate)
    band = (fr > 90) & (fr < 1400)
    notes = []
    for p in peaks:
        if mel['rms'][p] < 10 ** (-45 / 20):
            continue
        seg = x[int((p / FPS + 0.03) * rate):][:N]
        if len(seg) < N:
            continue
        mag = np.abs(np.fft.rfft(seg * np.hanning(N)))
        hps = mag.copy()
        for h in (2, 3):
            hps[: len(mag[::h])] *= mag[::h]
        f0 = fr[band][np.argmax(hps[band])]
        notes.append((p / FPS, int(round(12 * np.log2(f0 / 440) + 69)), float(mel['rms'][p])))
    top = np.percentile([n[2] for n in notes], 98)
    score['melody'] = [[int(round(t * 1000)), m, int(min(9, round(9 * v / top)))] for t, m, v in notes]

    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(score, fh, separators=(',', ':'))
    print(f'wrote {out}: {os.path.getsize(out)} bytes, {len(notes)} melody notes')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
