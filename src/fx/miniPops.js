// "Mini firework": every landed punch makes a burst of tiny copies of the
// current enemy fly out of it in all directions, spin, and fade away.
//
// For performance the minis are camera-facing sprites, not full 3D models:
// when a fight starts, the enemy model is rendered once into a small
// transparent texture (a "snapshot"), and the sprites use that picture.
import * as THREE from 'three';
import { Enemy } from '../enemies/enemy.js';

const POOL = 36;
const SNAP_SIZE = 256;

export class MiniPops {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.snapshots = new Map();   // enemy id → texture
    this.sprites = [];
    this.next = 0;
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.renderOrder = 5;
      this.scene.add(sp);
      this.sprites.push({ sp, mat, vel: new THREE.Vector3(), spin: 0, t: 0, life: 1, size: 0.3 });
    }
  }

  /** Render (once per enemy type) the picture used by the minis. */
  prepare(cfg) {
    if (this.snapshots.has(cfg.id)) { this.texture = this.snapshots.get(cfg.id); this.aspect = this.texture.userData.aspect; return; }
    const renderer = this.engine.renderer;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 4); scene.add(key);
    const e = new Enemy({ ...cfg, scale: 1 });
    e.alive = false;
    e.setAction('cheer', 0, { face: 'surprised' });   // arms up, surprised face
    scene.add(e.root);
    for (let i = 0; i < 40; i++) e.update(0.05, null);  // let the pose settle
    e.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(e.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const half = Math.max(size.x, size.y) / 2 * 1.08;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 50);
    cam.position.set(center.x, center.y, center.z + 10);
    cam.lookAt(center);
    const rt = new THREE.WebGLRenderTarget(SNAP_SIZE, SNAP_SIZE, { samples: 4 });
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.enabled = prevShadow;
    e.dispose();
    const tex = rt.texture;
    tex.userData.aspect = 1;
    this.snapshots.set(cfg.id, tex);
    this.texture = tex;
    this.aspect = 1;
  }

  /** Firework of minis bursting out of `point` in every direction. */
  burst(point, strength01 = 0.5) {
    if (!this.texture) return;
    const toCam = new THREE.Vector3().subVectors(this.camera.position, point).normalize();
    const count = 6 + Math.round(strength01 * 4);
    for (let i = 0; i < count; i++) {
      const m = this.sprites[this.next++ % this.sprites.length];
      // random direction on a sphere, pushed away from the camera and slightly upward
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.6 - 0.4, Math.random() * 2 - 1).normalize();
      const towardUs = dir.dot(toCam);
      if (towardUs > 0.1) dir.addScaledVector(toCam, -towardUs * 1.4).normalize();
      const speed = 2.6 + Math.random() * 2.4 + strength01 * 1.5;
      m.vel.copy(dir).multiplyScalar(speed);
      m.vel.y += 1.2;
      m.spin = (Math.random() * 2 - 1) * 9;
      m.t = 0;
      m.life = 0.65 + Math.random() * 0.35;
      m.size = 0.2 + Math.random() * 0.16;
      m.mat.map = this.texture;
      m.mat.rotation = Math.random() * 0.6 - 0.3;
      m.mat.opacity = 1;
      m.mat.needsUpdate = true;
      m.sp.position.copy(point);
      m.sp.scale.setScalar(0.01);
      m.sp.visible = true;
    }
  }

  update(dt) {
    for (const m of this.sprites) {
      if (!m.sp.visible) continue;
      m.t += dt;
      const k = m.t / m.life;
      if (k >= 1) { m.sp.visible = false; continue; }
      m.vel.y -= 6 * dt;
      m.vel.multiplyScalar(Math.exp(-1.2 * dt));
      m.sp.position.addScaledVector(m.vel, dt);
      m.mat.rotation += m.spin * dt;
      // pop in fast, hold, shrink + fade at the end
      const grow = Math.min(1, m.t / 0.08);
      const shrink = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      m.sp.scale.setScalar(m.size * grow * (0.6 + 0.4 * shrink));
      m.mat.opacity = shrink;
    }
  }

  hideAll() { for (const m of this.sprites) m.sp.visible = false; }
}
