# nurettincoban.github.io

The personal site of Nurettin Çoban — Senior Software Engineer in Helsinki: backend and
distributed systems, EV charging platforms, and open-source tools for AI coding agents.
Off the clock: house music as NUO.
Live at **https://nurettincoban.github.io/**.

The background is the cover of *Ad Astra* as a place: the artwork cut into layers —
rock walls, astronaut, ground, title — each at its own depth, with a camera that drifts
between them and dust in the air. Draw in it and it plays the track: two loops cut from
its own stems, shaped by how you draw, while the pen lights the rock and gathers the
dust. Press play on the track and its cover comes apart and falls into the astronaut's
visor; the canyon then performs the song from a score analysed out of the stems.

## How it is built

No build step, no framework, nothing to install. Static files served by GitHub Pages,
native ES modules, and three.js from a CDN through an import map.

```
index.html                  the page — content only; icons are drawn once in an SVG sprite
assets/css/site.css         every style; colours are tokens with a dark-mode set
assets/js/
  main.js                   entry point; starts Mars after first paint, when idle
  env.js                    what the device can afford, wide or narrow, reduced motion
  page.js                   theme switch, email, the name
  cards.js                  tilting cards; scenes that play only on screen
  projects.js               the live GitHub project list, cached six hours
  player.js                 the Ad Astra card and its YouTube player
  mars/
    index.js                wires the scene together; the frame loop
    scene.js                the cover in layers: depth, light, dust, the camera
    drawing.js              strokes drawn in the canyon, and their replays
    sparks.js               the 2D overlay: cover, card sparks, the cue's sparks
    perform.js              following the score while the video plays
  audio/
    ad-astra.js             the track's tempo, the loop region, the score
    studio.js               the loops and the chain they play through
    conductor.js            turns drawing into how the loops sound
assets/img/mars/            the cover's layers and their depth maps
assets/audio/               the two loops (melody, pad)
assets/data/ad-astra.json   the score
cv/                         the CV: index.html is the source (and /cv/), the PDF is printed from it
tools/stems/                how the score and the loops are made from the stems
tools/mars/                 how the cover was cut into layers (depth estimation, masks)
```

The page modules and the scene talk only through three window events:
`themechange` (repaint in the new colours), `cover` (play was pressed: take the cover
apart) and `music` (the video is playing or not, with its clock).

## Performance

- The scene's code and its largest layer download during parsing (`modulepreload`,
  `preload`), but it starts only after the first paint, when the browser is idle, and
  compiles its shaders asynchronously. Its layers weigh about 840 KB together.
- With reduced motion a single still frame is drawn and nothing runs.
- Nothing runs while the tab is hidden or the sky is off screen. The audio loops stop
  twelve quiet seconds after the last stroke; the overlay canvas runs only while
  something is flying; card scenes pause off screen.
- One fallback: if the GPU genuinely struggles for three
  seconds, one pixel per CSS pixel. A throttled page is not mistaken for a slow GPU.
- The loops (520 KB) load on the first stroke; the score (18 KB) on the first stroke
  or play.

## Running locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Modules do not load from `file://`.

## Regenerating

The CV uses the site's light palette and typography in a two-page A4 layout. The editable source and web version are `cv/index.html`; the homepage downloads `cv/nurettin-coban-cv.pdf`.

After editing the source, regenerate the PDF:

```bash
msedge --headless=new --no-pdf-header-footer --print-to-pdf=cv/nurettin-coban-cv.pdf cv/index.html
```

Alternatively, open `/cv/` locally and print to PDF at A4 and 100% scale, with background graphics enabled and browser headers and footers disabled. Check that the result has two pages and selectable text before replacing the download.

The score and the loops, from the stems (needs numpy, and ffmpeg for the loops):

```bash
python tools/stems/score.py <stems folder> assets/data/ad-astra.json
python tools/stems/loops.py <stems folder> assets/audio
```

## Music

*Ad Astra* by NUO, released on Soundtype (2023). The loops in `assets/audio` are
excerpts of it, and `assets/data/ad-astra.json` an analysis of it, published here by
the artist. They are not licensed for reuse.
