// Drawing the stars: one point per star, read straight from the simulation's textures.
// Fast stars run hot — inner orbits, shockwave debris, anything near a well. Colours
// come from the page's CSS, so the galaxy follows the theme: additive light on a dark
// sky, and plain paint on a light page, where additive light would vanish into white.
import {
  BufferGeometry, BufferAttribute, ShaderMaterial, Points, Scene, Color, AdditiveBlending, NormalBlending,
} from 'three';

export function createStars(sim, size, { quiet, small }) {
  const n = size * size, ref = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { ref[i * 2] = (i % size + 0.5) / size; ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size; }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('ref', new BufferAttribute(ref, 2));

  const uniforms = {
    tPos: { value: null }, tVel: { value: null },
    uSize: { value: 1 }, uMaxSize: { value: 8 }, uIntro: { value: quiet ? 1 : 0 },
    uLight: { value: 0 }, uGlow: { value: 0 }, uKick: sim.uniforms.uKick,
    uNear: { value: new Color() }, uFar: { value: new Color() },
  };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec2 ref;
      uniform sampler2D tPos, tVel;
      uniform float uSize, uMaxSize, uIntro, uKick, uGlow;
      varying float vHeat, vA;
      void main() {
        vec3 p = texture2D(tPos, ref).xyz;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vHeat = smoothstep(0.7, 2.8, length(texture2D(tVel, ref).xyz));
        // Capped: a few stars close to the camera would otherwise cost more pixels than
        // the other sixty thousand together.
        gl_PointSize = min(uSize * (0.7 + vHeat * 0.9 + uKick * 0.6) / -mv.z, uMaxSize);
        vA = uIntro * (0.55 + 0.45 * vHeat + uKick * 0.25) * (1.0 + uGlow * 0.6);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uNear, uFar;
      uniform float uLight;
      varying float vHeat, vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        if (r > 0.5) discard;
        vec3 c = mix(uFar, uNear, vHeat);
        c = mix(c, vec3(1.0), vHeat * vHeat * 0.55 * (1.0 - uLight));
        gl_FragColor = vec4(c, vA * smoothstep(0.5, 0.0, r) * mix(0.7, 0.35, uLight));
      }`,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const scene = new Scene();
  scene.add(points);

  return {
    scene, uniforms,
    get light() { return uniforms.uLight.value > 0.5; },
    get accent() { return `#${uniforms.uNear.value.getHexString()}`; },
    syncTheme() {
      const css = getComputedStyle(document.documentElement);
      uniforms.uNear.value.set(css.getPropertyValue('--accent').trim());
      uniforms.uFar.value.set(css.getPropertyValue('--dot-far').trim());
      const light = css.colorScheme.trim() !== 'dark';
      uniforms.uLight.value = light ? 1 : 0;
      material.blending = light ? NormalBlending : AdditiveBlending;
      material.needsUpdate = true;
    },
    fit(pixelRatio) {
      uniforms.uSize.value = 46 * pixelRatio * (small ? 1.4 : 1);
      uniforms.uMaxSize.value = 7 * pixelRatio;
    },
    render(renderer, camera) {
      uniforms.tPos.value = sim.positions;
      uniforms.tVel.value = sim.velocities;
      renderer.render(scene, camera);
    },
  };
}
