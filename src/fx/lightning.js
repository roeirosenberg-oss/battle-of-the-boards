// Electric arc effect: jagged glowing line between two points, regenerated each frame.
import * as THREE from 'three';

export class Arc {
  constructor(parent, { color = 0x9ff6ff, segments = 14, jitter = 0.18, width = 1 } = {}) {
    this.segments = segments;
    this.jitter = jitter;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array((segments + 1) * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false, linewidth: width });
    this.line = new THREE.Line(this.geo, this.mat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    parent.add(this.line);
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3();
    this.life = 0; this.maxLife = 0;
  }

  fire(a, b, life = 0.18) {
    this.a.copy(a); this.b.copy(b);
    this.life = this.maxLife = life;
    this.line.visible = true;
    this._regen();
  }

  _regen() {
    const n = this.segments;
    const dir = new THREE.Vector3().subVectors(this.b, this.a);
    const len = dir.length();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3().copy(this.a).addScaledVector(dir, t);
      if (i > 0 && i < n) {
        const j = this.jitter * len * Math.sin(Math.PI * t);
        p.x += (Math.random() - 0.5) * j; p.y += (Math.random() - 0.5) * j; p.z += (Math.random() - 0.5) * j;
      }
      this.positions[i * 3] = p.x; this.positions[i * 3 + 1] = p.y; this.positions[i * 3 + 2] = p.z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }

  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt;
    if (this.life <= 0) { this.line.visible = false; return; }
    this.mat.opacity = Math.min(1, this.life / this.maxLife * 1.5);
    this._regen();
  }

  dispose() { this.line.parent?.remove(this.line); this.geo.dispose(); this.mat.dispose(); }
}

/** A pool of arcs. */
export class ArcPool {
  constructor(parent, count = 8, opts = {}) {
    this.arcs = Array.from({ length: count }, () => new Arc(parent, opts));
    this.i = 0;
  }
  fire(a, b, life) { const arc = this.arcs[this.i++ % this.arcs.length]; arc.fire(a, b, life); return arc; }
  update(dt) { for (const a of this.arcs) a.update(dt); }
}
