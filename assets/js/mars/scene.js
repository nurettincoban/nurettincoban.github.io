// The Ad Astra cover as a place. The artwork is cut into four layers — rock walls,
// astronaut, title, ground — and each is pushed to its own depth (tools/mars/ made the
// layers and their depth maps). With the camera at rest every layer projects exactly
// onto its place in the artwork; as the camera drifts, they part.
//
// The rock is lit: its normals come from the depth map, a slow light wanders across it,
// and up to eight small lights (the pen, replaying strokes, notes) can be placed in the
// canyon. Dust hangs in the air and gathers around the pen.
import {
  Scene, PerspectiveCamera, Mesh, Points, BufferGeometry, BufferAttribute, ShaderMaterial, TextureLoader,
  SRGBColorSpace, NoColorSpace, MirroredRepeatWrapping, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter,
  AdditiveBlending, Raycaster, Plane, Vector2, Vector3, Vector4, Color,
} from 'three';
import { wide } from '../env.js';

const D = 2.0;                 // camera distance, in artwork heights
const ZS = 0.8;                // how far the nearest ground comes toward the camera
const SIZE = 2000;             // the artwork, in pixels; the boxes below are in them
const ASTRO_BOX = [760, 1220, 1080, 1800], TITLE_BOX = [80, 1940, 50, 340];
const ASTRO_D = 0.1616, TITLE_D = 0.30;
const VISOR = [985 / SIZE, 1 - 1175 / SIZE];           // where things fall into
export const LIGHTS = 8, WELLS = 4;
const PEN_Z = 0.42;            // the plane the pen draws on, in front of the walls

const images = new URL('../../img/mars/', import.meta.url).href;
const load = (name, { data = false, mirror = false } = {}) => new Promise((ok, no) => new TextureLoader().load(images + name, (t) => {
  t.colorSpace = data ? NoColorSpace : SRGBColorSpace;
  t.wrapS = mirror ? MirroredRepeatWrapping : ClampToEdgeWrapping; t.wrapT = ClampToEdgeWrapping;
  t.minFilter = data ? LinearFilter : LinearMipmapLinearFilter; t.generateMipmaps = !data; t.anisotropy = 4;
  ok(t);
}, undefined, no));

// A grid over a rectangle of the artwork, in uv (0..1, y up). It may run past the
// artwork: the wall and ground mirror sideways, so the canyon carries on to the left.
function grid(u0, u1, v0, v1, nx, ny) {
  const n = (nx + 1) * (ny + 1), uv = new Float32Array(n * 2), idx = [];
  for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
    uv[k * 2] = u0 + (u1 - u0) * i / nx; uv[k * 2 + 1] = v0 + (v1 - v0) * j / ny;
    if (i < nx && j < ny) { const a = k, b = k + 1, c = k + nx + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

const VERT = /* glsl */`
  uniform sampler2D uDepth; uniform float uDepthMul, uFlat, uD, uZS; uniform vec4 uBox;
  varying vec2 vUv, vArt; varying vec3 vPos;
  void main() {
    vUv = uv;
    vArt = uBox.xy + uv * uBox.zw;                       // where this is in the whole artwork
    float d = uFlat >= 0.0 ? uFlat : texture2D(uDepth, vArt).r * uDepthMul;
    float z = uZS * d;
    vPos = vec3((vArt - 0.5) * (uD - z) / uD, z);        // scaled back, so at rest it lands where it was
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uMap, uDepth; uniform float uDepthMul, uFlat, uGlow; uniform vec3 uSun, uBg;
  uniform vec4 uLights[${LIGHTS}];
  varying vec2 vUv, vArt; varying vec3 vPos;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    vec3 n = vec3(0.0, 0.0, 1.0);
    if (uFlat < 0.0) {
      float e = 0.006;
      float dx = texture2D(uDepth, vArt + vec2(e, 0.)).r - texture2D(uDepth, vArt - vec2(e, 0.)).r;
      float dy = texture2D(uDepth, vArt + vec2(0., e)).r - texture2D(uDepth, vArt - vec2(0., e)).r;
      n = normalize(vec3(-dx * uDepthMul, -dy * uDepthMul, 0.05));
      vec3 sun = normalize(uSun);
      c.rgb *= 1.0 + 0.55 * (dot(n, sun) - sun.z);       // flat rock keeps the artwork's own light
    }
    float lit = 0.0;
    for (int i = 0; i < ${LIGHTS}; i++) {
      vec4 l = uLights[i];
      vec3 L = l.xyz - vPos;
      lit += l.w / (1.0 + dot(L, L) / 0.06) * (0.3 + 0.7 * max(dot(n, normalize(L)), 0.0));
    }
    c.rgb *= 1.0 + uGlow + lit * vec3(2.0, 1.4, 1.0);
    c.rgb += vec3(1.0, 0.45, 0.2) * lit * 0.08;
    // above and below the artwork there is only the page
    c.rgb = mix(c.rgb, uBg, smoothstep(0.0, 0.03, max(max(vArt.y - 1.0, -vArt.y), 0.0)));
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`;

const DUST_V = /* glsl */`
  attribute vec4 seed; uniform float uT, uScale, uD, uKick; uniform vec4 uWells[${WELLS}];
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uT * 0.11 * seed.x + seed.y * 6.28) * 0.06 + uT * 0.006 * (seed.z - 0.3);
    p.y += cos(uT * 0.09 * seed.z + seed.x * 6.28) * 0.04 + uT * 0.004 * seed.w;
    p.xy = mod(p.xy + 0.9, 1.8) - 0.9;
    float near = 0.0;
    for (int i = 0; i < ${WELLS}; i++) {                 // dust is drawn to the pen, and lit by it
      vec2 to = uWells[i].xy * (uD - p.z) / (uD - uWells[i].z) - p.xy;
      float f = uWells[i].w * exp(-dot(to, to) / 0.012);
      p.xy += to * f * 0.55; near += f;
    }
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.0016 + 0.0034 * seed.w * seed.w) * (1.0 + uKick * 0.8 + near * 0.8) * uScale * uD / -mv.z;
    vA = (0.35 + 0.65 * seed.y) * (0.6 + 0.4 * sin(uT * (0.6 + seed.x) + seed.z * 40.0)) * (1.0 + near * 3.0 + uKick);
  }`;
const DUST_F = /* glsl */`
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.86) * vA * smoothstep(1.0, 0.2, r), 1.0);
  }`;

export async function createScene(renderer, canvas, sky, { motes = 900 } = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(2 * Math.atan(0.5 / D) * 180 / Math.PI, 1, 0.05, 10);

  const [wall, wallD, ground, groundD, astro, title] = await Promise.all([
    load('wall.webp', { mirror: true }), load('wall_d.png', { data: true, mirror: true }),
    load('ground.webp', { mirror: true }), load('ground_d.png', { data: true, mirror: true }),
    load('astro.webp'), load('title.webp'),
  ]);

  const sun = new Vector3(0.4, 0.5, 0.75), bg = new Color();
  const lights = Array.from({ length: LIGHTS }, () => new Vector4(0, 0, 0, 0));      // w is the strength
  const wells = Array.from({ length: WELLS }, () => new Vector4(0, 0, 0, 0));
  const boxOf = ([x0, x1, y0, y1]) => new Vector4(x0 / SIZE, 1 - y1 / SIZE, (x1 - x0) / SIZE, (y1 - y0) / SIZE);
  const materials = [];
  const layer = (map, depth, { mul = 1, flat = -1, box = new Vector4(0, 0, 1, 1), geo, order }) => {
    const material = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uMap: { value: map }, uDepth: { value: depth }, uDepthMul: { value: mul }, uFlat: { value: flat },
        uD: { value: D }, uZS: { value: ZS }, uBox: { value: box }, uSun: { value: sun }, uBg: { value: bg },
        uLights: { value: lights }, uGlow: { value: 0 },
      },
    });
    const m = new Mesh(geo, material);
    m.renderOrder = order; m.frustumCulled = false; scene.add(m); materials.push(material);
    return m;
  };
  const wideGrid = grid(-0.55, 1.08, -0.08, 1.08, 260, 200), quad = grid(0, 1, 0, 1, 1, 1);
  layer(wall, wallD, { mul: 0.5, geo: wideGrid, order: 0 });
  layer(astro, null, { flat: ASTRO_D, box: boxOf(ASTRO_BOX), geo: quad, order: 1 });
  const word = layer(title, null, { flat: TITLE_D, box: boxOf(TITLE_BOX), geo: quad, order: 2 });
  layer(ground, groundD, { geo: wideGrid, order: 3 });

  // Dust: motes hanging in the canyon air, like the specks on the cover.
  const p = new Float32Array(motes * 3), s = new Float32Array(motes * 4);
  for (let i = 0; i < motes; i++) {
    p[i * 3] = (Math.random() - 0.5) * 1.8; p[i * 3 + 1] = (Math.random() - 0.5) * 1.8; p[i * 3 + 2] = Math.random() * 1.25;
    for (let k = 0; k < 4; k++) s[i * 4 + k] = Math.random();
  }
  const dg = new BufferGeometry();
  dg.setAttribute('position', new BufferAttribute(p, 3)); dg.setAttribute('seed', new BufferAttribute(s, 4));
  const dust = new Points(dg, new ShaderMaterial({
    vertexShader: DUST_V, fragmentShader: DUST_F, transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uT: { value: 0 }, uScale: { value: 1000 }, uD: { value: D }, uKick: { value: 0 }, uWells: { value: wells } },
  }));
  dust.renderOrder = 4; dust.frustumCulled = false; scene.add(dust);
  materials.push(dust.material);

  const pivot = new Vector3(0, 0, ZS * ASTRO_D), aim = new Vector2(), cur = new Vector2();
  const ray = new Raycaster(), penPlane = new Plane(new Vector3(0, 0, 1), -PEN_Z), ndc = new Vector2(), hit = new Vector3(), projected = new Vector3();
  const visor = [(VISOR[0] - 0.5) * (D - pivot.z) / D, (VISOR[1] - 0.5) * (D - pivot.z) / D, pivot.z];
  let scroll = 0;
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') aim.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1); }, { passive: true });

  return {
    scene, camera, materials, lights, wells, visor,
    glow: { value: 0 },          // build-ups and pads: the title and the rock burn brighter
    kick: 0,                     // the beat, 0..1
    syncTheme() { bg.set(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#07070a'); renderer.setClearColor(bg, 1); },

    // Where the square artwork sits on screen. Wide screens: the astronaut stands in
    // the middle of the space right of the text, about half the screen tall, and the
    // canyon mirrors on under the text. Otherwise the artwork covers the sky, centred.
    // Either way the title leaves its place on the cover and hangs across the top.
    // Returns false while the sky has no size (not laid out yet).
    resize() {
      const w = sky.clientWidth, h = sky.clientHeight;
      if (!w || !h) return false;
      const aspect = (TITLE_BOX[1] - TITLE_BOX[0]) / (TITLE_BOX[3] - TITLE_BOX[2]);
      let side, ox, oy, tx, ty, tw;
      if (wide()) {
        const text = document.querySelector('main').getBoundingClientRect().right;
        const ax = Math.max(w * 0.6, (text + w) / 2);
        side = Math.max(h * 1.8, ax / 0.895, (w - ax) / 0.505);
        ox = ax - 0.495 * side; oy = h * 0.5 - 0.635 * side;
        tx = Math.max(w * 0.455, text + 28); tw = Math.min(w * 0.5, w * 0.95 - tx); ty = h * 0.085;
      } else {
        side = Math.max(w, h); ox = (w - side) / 2; oy = (h - side) / 2;
        tw = w * 0.9; tx = (w - tw) / 2; ty = h * 0.135;
      }
      const th = tw / aspect;
      word.material.uniforms.uBox.value.set((tx - ox) / side, 1 - (ty + th - oy) / side, tw / side, th / side);
      renderer.setSize(w, h, false);
      camera.setViewOffset(side, side, -ox, -oy, w, h);
      dust.material.uniforms.uScale.value = side * renderer.getPixelRatio();
      return true;
    },

    // t in seconds. The camera follows the pointer and the scroll, and drifts on its own.
    render(t, dt) {
      cur.lerp(aim, 1 - Math.pow(0.03, dt));
      scroll += (Math.min(scrollY / Math.max(1, innerHeight), 2.5) - scroll) * (1 - Math.pow(0.002, dt));
      camera.position.set(
        cur.x * 0.075 + Math.sin(t * 0.13) * 0.022,
        -cur.y * 0.04 + Math.sin(t * 0.17 + 1.3) * 0.012 + scroll * 0.03,
        D - 0.05 - Math.sin(t * 0.1) * 0.03 - scroll * 0.05 - this.kick * 0.012,
      );
      camera.lookAt(pivot);
      sun.set(0.4 + 0.45 * Math.sin(t * 0.21), 0.5 + 0.2 * Math.cos(t * 0.16), 0.75);
      for (const m of materials) if (m.uniforms.uGlow) m.uniforms.uGlow.value = this.glow.value * 0.18 + this.kick * 0.06;
      word.material.uniforms.uGlow.value = 0.25 + this.glow.value * 0.6 + this.kick * 0.45;
      dust.material.uniforms.uT.value = t; dust.material.uniforms.uKick.value = this.kick;
      renderer.render(scene, camera);
    },

    // The point in the canyon under a screen position: on a plane in front of the walls.
    under(x, y) {
      const r = canvas.getBoundingClientRect();
      ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(penPlane, hit) ? [hit.x, hit.y, hit.z] : [0, 0, PEN_Z];
    },
    // Where a point of the canyon appears on screen.
    toScreen(q) {
      const v = projected.set(q[0], q[1], q[2]).project(camera), r = canvas.getBoundingClientRect();
      return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
    },
  };
}
