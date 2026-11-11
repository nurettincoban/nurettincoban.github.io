# How the cover was cut into layers

`cover.jpg` is the Ad Astra artwork (2000 x 2000). Two scripts turn it into the files in
`assets/img/mars/`; both take one argument, a working directory `S` that holds
`work/cover.jpg` and `models/`.

1. `depth.py` runs Depth Anything v2 (`models/da.onnx`, from the Depth-Anything-ONNX
   releases) and U2-Net (`models/u2net.onnx`, from the rembg releases) with onnxruntime,
   and writes `work/depth.npy` and `work/seg_raw.png`.
2. `layers.py` reads those and `title_mask.png` (as `work/tb2.png`), and writes to `out/`:
   - `wall.webp`: the rock with the title and the astronaut painted out, and mirrored
     below the ground line so there is something behind the ground;
   - `ground.webp`, `astro.webp`, `title.webp`: the cut-outs, with alpha;
   - `wall_d.png`, `ground_d.png`: depth for the two displaced layers (the wall's is
     stored at twice its value).

`title_mask.png` is the lettering's shape. It started as a threshold on green/red (the
title is a purer red than the rock), then the second and third A were replaced by the
first, which is clean, and the R was drawn from its measurements.

Needs: numpy, scipy, opencv-python-headless, onnxruntime.
