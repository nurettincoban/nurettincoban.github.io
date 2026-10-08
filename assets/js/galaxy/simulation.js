// The galaxy, simulated. Every star has a position and a velocity in a float texture,
// and each step two fragment shaders integrate all of them on the GPU: gravity toward
// the core, a slow turbulent field, wells (the pen, and the playheads of replaying
// strokes), shockwaves (notes, supernovas), and a kick that throws the disk outward.
// It starts as a big bang; escaping stars are reborn on the spiral arms.
import { Vector4 } from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

export const STEP = 1 / 60;                    // the physics runs at a fixed 60 Hz
const WELLS = 4, SHOCKS = 8;

// Shared by both passes, so a star that respawns gets its new position and its matching
// orbital velocity in the same step.
const COMMON = /* glsl */`
  uniform float uTime, uDt, uCore, uKick;
  uniform vec4 uWells[${WELLS}];
  uniform vec4 uShocks[${SHOCKS}];
  uniform float uShockAmp[${SHOCKS}];
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // A fresh star on one of three spiral arms, with the velocity of a circular orbit.
  vec3 spawn(vec2 uv, out vec3 vel) {
    float s = fract(uTime * 0.731) * 17.0;
    float h1 = hash(uv + s), h2 = hash(uv * 1.7 + s + 3.1), h3 = hash(uv * 2.3 + s + 7.7), h4 = hash(uv * 3.1 + s + 1.3);
    float r = 0.35 + pow(h1, 1.15) * 10.5;   // a dense bulge, a sparse rim
    // The arm pattern turns slowly as a whole, like a density wave.
    float a = floor(h3 * 3.0) * 2.0944 + r * 0.55 - uTime * 0.12 + (h2 - 0.5) * (0.5 + 0.05 * r);
    vec3 p = vec3(cos(a) * r, (h4 - 0.5) * 0.6 / (1.0 + 0.3 * r), sin(a) * r);
    vel = vec3(-sin(a), 0.0, cos(a)) * sqrt(uCore / (r * r + 0.5) * r);
    return p;
  }
  // Swallowed by the core, escaped, or simply old: about one star in 330 a step is
  // reborn, which keeps the arms from winding up into a featureless disk.
  bool reborn(vec2 uv, vec3 p) {
    return length(p.xz) < 0.28 || length(p) > 18.0 || hash(uv + fract(uTime * 0.137)) < 0.003;
  }
`;

const VELOCITY = COMMON + /* glsl */`
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 p = texture2D(texturePosition, uv).xyz;
    vec3 v = texture2D(textureVelocity, uv).xyz;
    if (reborn(uv, p)) { vec3 nv; spawn(uv, nv); gl_FragColor = vec4(nv, 1.0); return; }

    v += -normalize(p) * uCore / (dot(p, p) + 0.5) * uDt;                 // core gravity, softened
    v.y -= p.y * 0.8 * uDt;                                                // back toward the disk
    v += vec3(sin(p.z * 0.7 + uTime * 0.3), sin(p.x * 0.6 - uTime * 0.2) * 0.3,
              cos(p.x * 0.5 + p.z * 0.4 + uTime * 0.25)) * 0.12 * uDt;     // the "gas"
    for (int i = 0; i < ${WELLS}; i++) {
      if (uWells[i].w <= 0.0) continue;
      vec3 dw = uWells[i].xyz - p;
      v += normalize(dw + 1e-5) * uWells[i].w / (dot(dw, dw) + 0.35) * uDt;
    }
    for (int i = 0; i < ${SHOCKS}; i++) {                                 // shells pushing outward
      float age = uTime - uShocks[i].w;
      if (age <= 0.0 || age > 3.0) continue;
      vec3 ds = p - uShocks[i].xyz;
      float d = length(ds) + 1e-4;
      v += ds / d * exp(-pow((d - age * 7.0) * 1.2, 2.0)) * exp(-age * 1.2) * 14.0 * uShockAmp[i] * uDt;
    }
    v += normalize(vec3(p.x, 0.0, p.z) + 1e-4) * uKick * 3.0 * uDt;        // the kick
    v *= 1.0 - 0.02 * uDt;
    float sp = length(v);
    if (sp > 14.0) v *= 14.0 / sp;
    gl_FragColor = vec4(v, 1.0);
  }`;

const POSITION = COMMON + /* glsl */`
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 p = texture2D(texturePosition, uv).xyz;
    if (reborn(uv, p)) { vec3 nv; gl_FragColor = vec4(spawn(uv, nv), 1.0); return; }
    gl_FragColor = vec4(p + texture2D(textureVelocity, uv).xyz * uDt, 1.0);
  }`;

// Returns null where float render targets are unsupported.
export function createSimulation(renderer, size, quiet) {
  const uniforms = {
    uTime: { value: 0 },
    uDt: { value: STEP },
    uCore: { value: 6 },
    uKick: { value: 0 },
    uWells: { value: Array.from({ length: WELLS }, () => new Vector4(0, 0, 0, 0)) },      // xyz, mass
    uShocks: { value: Array.from({ length: SHOCKS }, () => new Vector4(0, 0, 0, -100)) }, // xyz, start
    uShockAmp: { value: new Array(SHOCKS).fill(0) },
  };
  const gpu = new GPUComputationRenderer(size, size, renderer);
  const pos0 = gpu.createTexture(), vel0 = gpu.createTexture();
  (quiet ? settledDisk : bigBang)(pos0.image.data, vel0.image.data);
  const velVar = gpu.addVariable('textureVelocity', VELOCITY, vel0);
  const posVar = gpu.addVariable('texturePosition', POSITION, pos0);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  Object.assign(velVar.material.uniforms, uniforms);
  Object.assign(posVar.material.uniforms, uniforms);
  if (gpu.init() !== null) return null;

  let slot = 0;
  return {
    uniforms,
    wells: uniforms.uWells.value,
    materials: [velVar.material, posVar.material],
    step() { uniforms.uTime.value += STEP; gpu.compute(); },
    get positions() { return gpu.getCurrentRenderTarget(posVar).texture; },
    get velocities() { return gpu.getCurrentRenderTarget(velVar).texture; },
    // An expanding shell from p, as strong as amp (a supernova is 1).
    shock(p, amp) {
      uniforms.uShocks.value[slot].set(p[0], p[1], p[2], uniforms.uTime.value);
      uniforms.uShockAmp.value[slot] = amp;
      slot = (slot + 1) % SHOCKS;
    },
  };
}

// Everything starts in a small shell around the core, flying outward with a twist.
function bigBang(P, V) {
  for (let k = 0; k < P.length; k += 4) {
    const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.3;
    const s = 2 + Math.pow(Math.random(), 1.5) * 9, y = (Math.random() - 0.5) * 0.5;
    P[k] = Math.cos(a) * r; P[k + 1] = y; P[k + 2] = Math.sin(a) * r; P[k + 3] = 1;
    V[k] = Math.cos(a) * s - Math.sin(a) * s * 0.6; V[k + 1] = y * 4; V[k + 2] = Math.sin(a) * s + Math.cos(a) * s * 0.6; V[k + 3] = 1;
  }
}

// With reduced motion: a disk that already looks settled.
function settledDisk(P, V) {
  for (let k = 0; k < P.length; k += 4) {
    const a = Math.random() * Math.PI * 2, r = 1 + Math.pow(Math.random(), 0.75) * 9.5, s = Math.sqrt(6 / (r * r + 0.5) * r);
    P[k] = Math.cos(a) * r; P[k + 1] = (Math.random() - 0.5) * 0.3; P[k + 2] = Math.sin(a) * r; P[k + 3] = 1;
    V[k] = -Math.sin(a) * s; V[k + 2] = Math.cos(a) * s; V[k + 3] = 1;
  }
}
