# nurettincoban.github.io

The personal site of Nurettin Çoban — Senior Software Engineer in Helsinki: backend and
distributed systems, EV charging platforms, and open-source tools for AI coding agents.
Off the clock: house music as NUO.
Live at **https://nurettincoban.github.io/**.

The background is a galaxy simulated on the GPU. Draw in it and it plays *Ad Astra*:
two loops cut from the track's own stems, shaped by how you draw. Press play on the
track and its cover comes apart into the galaxy, which then performs the song from a
score analysed out of the stems.

## How it is built

No build step, no framework, nothing to install. Static files served by GitHub Pages,
native ES modules, and three.js from a CDN through an import map.

```
index.html                  the page — content only; icons are drawn once in an SVG sprite
assets/css/site.css         every style; colours are tokens with a dark-mode set
assets/js/
  main.js                   entry point; starts the galaxy after first paint, when idle
  env.js                    what the device can afford, reduced motion
  page.js                   theme switch, email, the name
  cards.js                  tilting cards; scenes that play only on screen
  projects.js               the live GitHub project list, cached six hours
  player.js                 the Ad Astra card and its YouTube player
  galaxy/
    index.js                wires the galaxy together; the frame loop
    simulation.js           the stars' physics, in two fragment shaders
    stars.js                drawing the stars
    view.js                 the camera; screen ↔ disk
    drawing.js              strokes drawn in the sky, and their replays
    sparks.js               the 2D overlay: cover, card sparks, the cue's stars
    perform.js              the galaxy performing Ad Astra while the video plays
  audio/
    ad-astra.js             the track's tempo, the loop region, the score
    studio.js               the loops and the chain they play through
    conductor.js            turns drawing into how the loops sound
assets/audio/               the two loops (melody, pad)
assets/data/ad-astra.json   the score
cv/                         the CV: index.html is the source (and /cv/), the PDF is printed from it
tools/stems/                how the score and the loops are made from the stems
```

The page modules and the galaxy talk only through three window events:
`themechange` (repaint in the new colours), `cover` (play was pressed: take the cover
apart) and `music` (the video is playing or not, with its clock).

## Performance

- The galaxy's code downloads during parsing (`modulepreload`), but it starts only after
  the first paint, when the browser is idle, and compiles its shaders asynchronously —
  no frame of the page's load blocks for more than 50 ms.
- Physics runs at a fixed 60 Hz and the galaxy is drawn only when it stepped, so a
  120 Hz screen does not draw every picture twice.
- Nothing runs while the tab is hidden or the sky is off screen. The audio loops stop
  twelve quiet seconds after the last stroke; the overlay canvas runs only while
  something is flying; card scenes pause off screen.
- One fallback, and it never removes stars: if the GPU genuinely struggles for three
  seconds, one pixel per CSS pixel. A throttled page is not mistaken for a slow GPU.
- The loops (520 KB) load on the first stroke; the score (18 KB) on the first stroke
  or play.

## Running locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Modules do not load from `file://`.

## Regenerating

The CV, after editing `cv/index.html`:

```bash
msedge --headless=new --no-pdf-header-footer --print-to-pdf=cv/nurettin-coban-cv.pdf cv/index.html
```

The score and the loops, from the stems (needs numpy, and ffmpeg for the loops):

```bash
python tools/stems/score.py <stems folder> assets/data/ad-astra.json
python tools/stems/loops.py <stems folder> assets/audio
```

## Music

*Ad Astra* by NUO, released on Soundtype (2023). The loops in `assets/audio` are
excerpts of it, and `assets/data/ad-astra.json` an analysis of it, published here by
the artist. They are not licensed for reuse.
