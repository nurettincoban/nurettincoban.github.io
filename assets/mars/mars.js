// The Ad Astra cover as a place: the artwork cut into layers (rock walls, astronaut,
// ground, title), each pushed to its own depth, with a camera that drifts between them.
// At rest every layer projects exactly onto its place in the original artwork.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial,
  TextureLoader, SRGBColorSpace, NoColorSpace, MirroredRepeatWrapping, ClampToEdgeWrapping, LinearFilter,
  LinearMipmapLinearFilter, Points, AdditiveBlending, Vector2, Vector3, Color,
} from 'three';

const D = 2.0;           // camera distance, in artwork heights
const ZS = 0.8;          // how far the nearest ground comes toward the camera
const ASTRO_BOX = [760, 1220, 1080, 1800], TITLE_BOX = [80, 1940, 50, 340], SIZE = 2000;
const ASTRO_D = 0.1616, TITLE_D = 0.30;

const base = new URL('.', import.meta.url).href;
const load = (name, { data = false, mirror = false } = {}) => new Promise((ok, no) => new TextureLoader().load(base + name, (t) => {
  t.colorSpace = data ? NoColorSpace : SRGBColorSpace;
  t.wrapS = mirror ? MirroredRepeatWrapping : ClampToEdgeWrapping; t.wrapT = ClampToEdgeWrapping;
  t.minFilter = data ? LinearFilter : LinearMipmapLinearFilter; t.generateMipmaps = !data; t.anisotropy = 4;
  ok(t);
}, undefined, no));

// A grid over a rectangle of the artwork, in uv (0..1, y up). It may run past the
// artwork: the wall texture mirrors sideways, so the canyon carries on.
function grid(u0, u1, v0, v1, nx, ny) {
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3), uv = new Float32Array((nx + 1) * (ny + 1) * 2), idx = [];
  for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
    uv[k * 2] = u0 + (u1 - u0) * i / nx; uv[k * 2 + 1] = v0 + (v1 - v0) * j / ny;
    if (i < nx && j < ny) { const a = k, b = k + 1, c = k + nx + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

const VERT = /* glsl */`
  uniform sampler2D uDepth; uniform float uDepthMul, uFlat, uD, uZS; uniform vec4 uBox;
  varying vec2 vUv, vArt; varying float vDepth;
  void main() {
    vUv = uv;
    vArt = uBox.xy + uv * uBox.zw;                       // where this is in the whole artwork
    float d = uFlat >= 0.0 ? uFlat : texture2D(uDepth, vArt).r * uDepthMul;
    vDepth = d;
    float z = uZS * d;
    gl_Position = projectionMatrix * viewMatrix * vec4((vArt - 0.5) * (uD - z) / uD, z, 1.0);
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uMap, uDepth; uniform float uDepthMul, uFlat, uOpen, uSideFade, uGlow, uDim; uniform vec3 uLight, uBg;
  varying vec2 vUv, vArt; varying float vDepth;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (uFlat < 0.0) {
      // the rock answers a light that wanders: normals from the depth map
      float e = 0.006;
      float dx = texture2D(uDepth, vArt + vec2(e, 0.)).r - texture2D(uDepth, vArt - vec2(e, 0.)).r;
      float dy = texture2D(uDepth, vArt + vec2(0., e)).r - texture2D(uDepth, vArt - vec2(0., e)).r;
      vec3 n = normalize(vec3(-dx, -dy, 0.05) * vec3(uDepthMul, uDepthMul, 1.));
      c.rgb *= 1.0 + 0.55 * (dot(n, normalize(uLight)) - normalize(uLight).z);
    }
    c.rgb *= 1.0 + uGlow;
    // past the artwork's left edge the mirrored canyon sinks into the page's dark
    float out_ = max(-vArt.x, 0.0);
    c.rgb = mix(c.rgb, uBg, (1.0 - exp(-out_ * 10.0)) * uSideFade);
    c.rgb = mix(c.rgb, uBg, uDim);
    float outY = smoothstep(0.0, 0.03, max(max(vArt.y - 1.0, -vArt.y), 0.0));   // above and below the cover: the page
    c.rgb = mix(c.rgb, uBg, outY); c.a *= mix(1.0, 1.0 - outY, uOpen);
    // the far crevice opens onto whatever is behind the canvas (the galaxy)
    float open = smoothstep(0.035, 0.085, vDepth);
    float edge = smoothstep(-0.02, 0.2, vArt.x) ;
    c.a *= mix(1.0, open * edge, uOpen * step(uFlat, -0.5));
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`;

const DUST_V = /* glsl */`
  attribute vec4 seed; uniform float uT, uScale, uD;
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uT * 0.11 * seed.x + seed.y * 6.28) * 0.06 + uT * 0.006 * (seed.z - 0.3);
    p.y += cos(uT * 0.09 * seed.z + seed.x * 6.28) * 0.04 + uT * 0.004 * seed.w;
    p.xy = mod(p.xy + 0.9, 1.8) - 0.9;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.0016 + 0.0034 * seed.w * seed.w) * uScale * uD / -mv.z;
    vA = (0.35 + 0.65 * seed.y) * (0.6 + 0.4 * sin(uT * (0.6 + seed.x) + seed.z * 40.0));
  }`;
const DUST_F = /* glsl */`
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.86) * vA * smoothstep(1.0, 0.2, r), 1.0);
  }`;

export async function createMars(canvas, host, { variant = 'a', bg = '#07070a' } = {}) {
  const open = variant === 'c';
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: open, powerPreference: 'high-performance' });
  renderer.setClearColor(new Color(bg), open ? 0 : 1);
  const scene = new Scene();
  const camera = new PerspectiveCamera(2 * Math.atan(0.5 / D) * 180 / Math.PI, 1, 0.05, 10);

  const [wall, wallD, ground, groundD, astro, title] = await Promise.all([
    load('wall.jpg', { mirror: true }), load('wall_d.png', { data: true, mirror: true }),
    load('ground.webp', { mirror: true }), load('ground_d.png', { data: true, mirror: true }),
    load('astro.webp'), load('title.webp'),
  ]);

  const light = new Vector3(0.4, 0.5, 0.75), bgc = new Color(bg);
  const layer = (map, depth, { mul = 1, flat = -1, box = [0, 0, 1, 1], geo, order }) => {
    const m = new Mesh(geo, new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uMap: { value: map }, uDepth: { value: depth }, uDepthMul: { value: mul }, uFlat: { value: flat },
        uD: { value: D }, uZS: { value: ZS }, uBox: { value: box }, uLight: { value: light }, uBg: { value: bgc },
        uOpen: { value: open ? 1 : 0 }, uSideFade: { value: variant === 'b' ? 1 : 0 }, uGlow: { value: 0 }, uDim: { value: 0 },
      },
    }));
    m.renderOrder = order; m.frustumCulled = false; scene.add(m); return m;
  };
  const boxOf = ([x0, x1, y0, y1]) => [x0 / SIZE, 1 - y1 / SIZE, (x1 - x0) / SIZE, (y1 - y0) / SIZE];
  const left = variant === 'b' ? -1.6 : -0.08;       // b: the canyon mirrors on to the left
  const wide = grid(left, 1.08, -0.08, 1.08, variant === 'b' ? 360 : 220, 220);
  const walls = layer(wall, wallD, { mul: 0.5, geo: wide, order: 0 });
  const man = layer(astro, null, { flat: ASTRO_D, box: boxOf(ASTRO_BOX), geo: grid(0, 1, 0, 1, 1, 1), order: 1 });
  const word = layer(title, null, { flat: TITLE_D, box: boxOf(TITLE_BOX), geo: grid(0, 1, 0, 1, 1, 1), order: 2 });
  const floor = layer(ground, groundD, { geo: wide, order: 3 });
  word.material.uniforms.uGlow.value = variant === 'b' ? 0 : 0.25;

  // dust: a few hundred motes hanging in the canyon air, like the specks on the cover
  const N = 420, p = new Float32Array(N * 3), s = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    p[i * 3] = (Math.random() - 0.5) * 1.8; p[i * 3 + 1] = (Math.random() - 0.5) * 1.8; p[i * 3 + 2] = Math.random() * 1.25;
    for (let k = 0; k < 4; k++) s[i * 4 + k] = Math.random();
  }
  const dg = new BufferGeometry(); dg.setAttribute('position', new BufferAttribute(p, 3)); dg.setAttribute('seed', new BufferAttribute(s, 4));
  const dust = new Points(dg, new ShaderMaterial({
    vertexShader: DUST_V, fragmentShader: DUST_F, transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uT: { value: 0 }, uScale: { value: 1000 }, uD: { value: D } },
  }));
  dust.renderOrder = 4; dust.frustumCulled = false; scene.add(dust);

  // ---- framing: where the square artwork sits on screen, per variant
  let W = 1, H = 1, side = 1, ox = 0, oy = 0;
  function frame() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    const wideScreen = W > H * 1.15;
    if (variant === 'a') {                 // fills the screen; the astronaut large, right of the text
      side = wideScreen ? Math.max(W * 1.2, H) : Math.max(W, H);
      ox = wideScreen ? 0 : (W - side) / 2;
      oy = wideScreen ? Math.min(0, Math.max(H - side, H * 0.5 - 0.635 * side)) : (H - side) / 2;
    } else {                               // the whole cover, untouched, on the right
      side = Math.min(W, H); ox = W - side; oy = H - side;
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    camera.aspect = 1; camera.setViewOffset(side, side, -ox, -oy, W, H);
    dust.material.uniforms.uScale.value = side * dpr;
    // a: the title leaves its place on the cover and hangs across the top of the screen
    if (variant === 'a') {
      const aspect = (TITLE_BOX[1] - TITLE_BOX[0]) / (TITLE_BOX[3] - TITLE_BOX[2]);
      const tw = wideScreen ? W * 0.5 : W * 0.9, th = tw / aspect;
      const tx = wideScreen ? W * 0.455 : (W - tw) / 2, ty = wideScreen ? H * 0.085 : H * 0.135;
      word.material.uniforms.uBox.value = [(tx - ox) / side, 1 - (ty + th - oy) / side, tw / side, th / side];
    }
  }

  // ---- motion: pointer, scroll, and a slow drift of its own
  const aim = new Vector2(), cur = new Vector2(), pivot = new Vector3(0, 0, ZS * ASTRO_D);
  addEventListener('pointermove', (e) => aim.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1));
  const push = variant === 'a' ? 0.05 : 0.012;
  const api = { frozen: null, render };
  function render(t) {
    const f = api.frozen;
    if (f) { cur.set(f.x, f.y); t = f.t; } else cur.lerp(aim, 0.045);
    const sc = Math.min((window.scrollY || 0) / Math.max(1, innerHeight), 2.5);
    const dx = cur.x * 0.075 + Math.sin(t * 0.13) * 0.022, dy = -cur.y * 0.04 + Math.sin(t * 0.17 + 1.3) * 0.012 + sc * 0.03;
    camera.position.set(dx, dy, D - push - Math.sin(t * 0.1) * push * 0.6 - sc * 0.07);
    camera.lookAt(pivot);
    light.set(0.4 + 0.45 * Math.sin(t * 0.21), 0.5 + 0.2 * Math.cos(t * 0.16), 0.75);
    dust.material.uniforms.uT.value = t;
    renderer.render(scene, camera);
  }
  frame(); addEventListener('resize', frame);
  api.start = () => renderer.setAnimationLoop((ms) => render(ms / 1000)); api.stop = () => renderer.setAnimationLoop(null);
  api.start();
  canvas.classList.add('on');
  return api;
}
