// The camera: a slow orbit around the galaxy. On wide screens the galaxy sits right of
// the text, and scrolling tips the disk toward edge-on. Also maps between the screen
// and the galaxy's disk, in both directions.
import { PerspectiveCamera, Raycaster, Plane, Vector2, Vector3 } from 'three';

export const wide = () => innerWidth >= 1000;

export function createView(renderer, canvas, sky) {
  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  let target = 0, scroll = 0, azimuth = 0.6, maxScroll = 1;
  new ResizeObserver(() => { maxScroll = document.documentElement.scrollHeight - innerHeight; }).observe(document.body);
  addEventListener('scroll', () => { target = wide() && maxScroll > 0 ? scrollY / maxScroll : 0; }, { passive: true });

  function place() {
    const R = camera.aspect < 1 ? 23 : 15, el = 0.95 - scroll * 0.75;
    camera.position.set(R * Math.cos(el) * Math.sin(azimuth), R * Math.sin(el), R * Math.cos(el) * Math.cos(azimuth));
    camera.lookAt(0, 0, 0);
  }

  const ray = new Raycaster(), disk = new Plane(new Vector3(0, 1, 0), 0);
  const ndc = new Vector2(), hit = new Vector3(), projected = new Vector3();

  return {
    camera,
    // Returns false while the sky has no size (not laid out yet).
    resize() {
      const w = sky.clientWidth, h = sky.clientHeight;
      if (!w || !h) return false;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      if (wide()) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      place();
      return true;
    },
    update(dt) {
      scroll += (target - scroll) * (1 - Math.pow(0.002, dt));
      azimuth += dt * 0.025;
      place();
    },
    // The point on the disk under a screen position, or null above the horizon.
    onDisk(x, y) {
      const r = canvas.getBoundingClientRect();
      ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(disk, hit)) return null;
      hit.clampLength(0, 14);
      return [hit.x, hit.y, hit.z];
    },
    // Where a point of the galaxy appears on screen.
    toScreen(p) {
      const v = projected.set(p[0], p[1], p[2]).project(camera), r = canvas.getBoundingClientRect();
      return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
    },
  };
}
