// Pooled particle systems: glowing sparks (points) and 3D confetti (instanced quads).
import * as THREE from 'three';
import { dotTexture } from '../world/textures.js';

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor * 1.8, t.a * vAlpha);
}`;

export class SparkSystem {
  constructor(scene, max = 1500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTexture() } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  /**
   * Emit a burst.
   * @param {THREE.Vector3} at
   * @param {object} o count, color(s), speed, spread, life, size, gravity, dir
   */
  burst(at, { count = 30, colors = [0xffd27a, 0xffffff], speed = 4, spread = 1, life = 0.6, size = 0.12, gravity = -6, dir = null, drag = 1.5 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = at.x; this.pos[i * 3 + 1] = at.y; this.pos[i * 3 + 2] = at.z;
      let vx = (Math.random() - 0.5) * 2, vy = (Math.random() - 0.5) * 2, vz = (Math.random() - 0.5) * 2;
      const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      const s = speed * (0.35 + Math.random() * 0.9);
      if (dir) {
        vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread;
      }
      this.vel[i * 3] = vx * s; this.vel[i * 3 + 1] = vy * s; this.vel[i * 3 + 2] = vz * s;
      this._c.set(colors[Math.floor(Math.random() * colors.length)]);
      this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.8);
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.gravity[i] = gravity; this.drag[i] = drag;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.gravity[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
  }
}

/** Tumbling 3D confetti for the finale. */
export class Confetti {
  constructor(scene, count = 700) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.09, 0.16);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6, emissive: 0x222222 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const palette = [0xffd36a, 0xff4d6d, 0x3cf2ff, 0x7cff6b, 0xb06bff, 0xffffff, 0xffa31a];
    const c = new THREE.Color();
    this.p = []; this.dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      c.set(palette[i % palette.length]);
      this.mesh.setColorAt(i, c);
      this.p.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), active: false });
    }
    scene.add(this.mesh);
  }

  /** Rain confetti over a box area. */
  start(center, w = 16, d = 12, h = 10) {
    this.mesh.visible = true;
    this.center = center.clone(); this.w = w; this.d = d; this.h = h;
    for (const q of this.p) this._respawn(q, true);
  }

  _respawn(q, initial) {
    q.pos.set(this.center.x + (Math.random() - 0.5) * this.w, this.center.y + (initial ? Math.random() * this.h : this.h), this.center.z + (Math.random() - 0.5) * this.d);
    q.vel.set((Math.random() - 0.5) * 0.6, -0.8 - Math.random() * 0.9, (Math.random() - 0.5) * 0.6);
    q.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    q.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    q.active = true;
  }

  burst(at, n = 200) {
    if (!this.center) this.start(at);
    for (let i = 0; i < n; i++) {
      const q = this.p[Math.floor(Math.random() * this.count)];
      q.pos.copy(at);
      q.vel.set((Math.random() - 0.5) * 7, 4 + Math.random() * 6, (Math.random() - 0.5) * 7);
    }
  }

  stop() { this.mesh.visible = false; this.center = null; }

  update(dt, t) {
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.count; i++) {
      const q = this.p[i];
      q.vel.y = Math.max(q.vel.y - 3 * dt, -1.6);
      q.vel.x += Math.sin(t * 2 + i) * 0.02;
      q.pos.addScaledVector(q.vel, dt);
      q.rot.x += q.spin.x * dt; q.rot.y += q.spin.y * dt; q.rot.z += q.spin.z * dt;
      if (q.pos.y < this.center.y - 0.5) this._respawn(q, false);
      this.dummy.position.copy(q.pos); this.dummy.rotation.copy(q.rot);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
