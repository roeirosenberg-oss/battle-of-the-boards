// Procedural humanoid rig for the electronic enemies: body, face, two arms
// with fists, two legs. Animation is pose-based: every frame the current
// action produces target joint angles that the rig eases toward.
import * as THREE from 'three';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class EnemyRig {
  /**
   * @param {object} p proportions:
   *  hipHeight, hipWidth, legUpper, legLower, legThick, footSize,
   *  shoulderY, shoulderX, armUpper, armLower, armThick, fistSize,
   *  limbColor, jointColor, fistColor, footColor, fistStyle ('glove'|'robot'|'claw'), mechanical
   */
  constructor(p) {
    this.p = p;
    this.materials = [];           // per-enemy materials (for hit flashes)
    this.root = new THREE.Group();
    this.bob = new THREE.Group();  // vertical bounce + lean container
    this.root.add(this.bob);
    this.hips = new THREE.Group();
    this.hips.position.y = p.hipHeight;
    this.bob.add(this.hips);
    this.torso = new THREE.Group(); // model-specific body goes here (origin = hips)
    this.hips.add(this.torso);
    this.hurtboxes = [];
    this.fx = { flash: 0 };

    const limbM = this.mat(p.limbColor ?? 0xb8bec6, { metalness: p.mechanical ? 0.85 : 0.6, roughness: 0.35 });
    const jointM = this.mat(p.jointColor ?? 0x2a2a30, { metalness: 0.6, roughness: 0.4, emissive: p.jointGlow ?? 0x000000, emissiveIntensity: p.jointGlow ? 0.7 : 0 });
    const fistM = this.mat(p.fistColor ?? 0xd61f2c, { roughness: p.fistStyle === 'glove' ? 0.45 : 0.35, metalness: p.fistStyle === 'glove' ? 0.05 : 0.7 });
    const footM = this.mat(p.footColor ?? 0x222222, { roughness: 0.5, metalness: 0.4 });
    this.limbM = limbM; this.fistM = fistM;

    this.arms = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1; // enemy's own left is +X in its local space (it faces +Z)
      const shoulder = new THREE.Group();
      shoulder.position.set(s * p.shoulderX, p.shoulderY, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(p.armThick * 1.5, 16, 12), jointM);
      shoulder.add(ball);
      const upper = this._limb(p.armUpper, p.armThick, limbM);
      shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -p.armUpper;
      elbow.add(new THREE.Mesh(new THREE.SphereGeometry(p.armThick * 1.3, 14, 10), jointM));
      const lower = this._limb(p.armLower, p.armThick * 0.9, limbM);
      elbow.add(lower);
      const wrist = new THREE.Group(); wrist.position.y = -p.armLower;
      const fist = this._fist(p.fistStyle ?? 'glove', p.fistSize, fistM, jointM, s);
      wrist.add(fist);
      elbow.add(wrist);
      shoulder.add(elbow);
      this.hips.add(shoulder);
      this.arms[side] = { shoulder, elbow, wrist, fist, side: s };
    }

    this.legs = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const hip = new THREE.Group();
      hip.position.set(s * p.hipWidth, 0, 0);
      hip.add(new THREE.Mesh(new THREE.SphereGeometry(p.legThick * 1.4, 14, 10), jointM));
      hip.add(this._limb(p.legUpper, p.legThick, limbM));
      const knee = new THREE.Group(); knee.position.y = -p.legUpper;
      knee.add(new THREE.Mesh(new THREE.SphereGeometry(p.legThick * 1.25, 14, 10), jointM));
      knee.add(this._limb(p.legLower, p.legThick * 0.9, limbM));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(p.footSize * 0.9, p.footSize * 0.45, p.footSize * 1.5), footM);
      foot.position.set(0, -p.legLower - p.footSize * 0.1, p.footSize * 0.35);
      knee.add(foot);
      hip.add(knee);
      this.hips.add(hip);
      this.legs[side] = { hip, knee, foot };
    }

    // pose state (current) — all angles in radians
    this.pose = this._neutralPose();
    this.target = this._neutralPose();
    this.offset = new THREE.Vector3(); // root-relative offset (dodges, lunges)
    this.offsetTarget = new THREE.Vector3();
    this.stiffness = 14;
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  }

  /** Create a per-enemy material that participates in hit flashes. */
  mat(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...opts });
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseEmissiveIntensity = m.emissiveIntensity;
    this.materials.push(m);
    return m;
  }

  registerMaterials(list) {
    for (const m of list) {
      if (!m.emissive) continue;
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseEmissiveIntensity = m.emissiveIntensity;
      this.materials.push(m);
    }
  }

  addHurtbox(obj, radius) { this.hurtboxes.push({ obj, radius }); }

  _limb(len, thick, mat) {
    const g = this.p.mechanical
      ? new THREE.CylinderGeometry(thick, thick * 0.85, len, 10)
      : new THREE.CapsuleGeometry(thick, Math.max(0.001, len - thick * 2), 4, 10);
    const m = new THREE.Mesh(g, mat);
    m.position.y = -len / 2;
    if (this.p.mechanical) {
      // piston detail
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.35, thick * 0.35, len * 0.7, 6), this.p.pistonMat || mat);
      piston.position.set(0, 0, thick * 1.05);
      m.add(piston);
    }
    return m;
  }

  _fist(style, size, mat, jointM, s) {
    const g = new THREE.Group();
    if (style === 'glove') {
      const main = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 16), mat);
      main.scale.set(1, 1.05, 1.2); main.position.y = -size * 0.75; g.add(main);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(size * 0.42, 12, 10), mat);
      thumb.position.set(-s * size * 0.75, -size * 0.55, size * 0.35); g.add(thumb);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.7, size * 0.75, size * 0.55, 16), this.mat(0xf2f2f2, { roughness: 0.6 }));
      cuff.position.y = -size * 0.05; g.add(cuff);
    } else {
      // robotic fist: boxy palm + knuckle cylinders + thumb block
      const palm = new THREE.Mesh(new THREE.BoxGeometry(size * 1.7, size * 1.6, size * 1.5), mat);
      palm.position.y = -size * 0.85; g.add(palm);
      for (let k = 0; k < 4; k++) {
        const kn = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.2, size * 0.36, 10), jointM);
        kn.rotation.x = Math.PI / 2;
        kn.position.set(-size * 0.6 + k * size * 0.4, -size * 1.55, size * 0.6);
        g.add(kn);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(size * 0.45, size * 0.9, size * 0.5), mat);
      thumb.position.set(-s * size * 0.95, -size * 0.8, size * 0.35); g.add(thumb);
      const wristRing = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.6, size * 0.6, size * 0.3, 14), jointM);
      g.add(wristRing);
    }
    return g;
  }

  _neutralPose() {
    return {
      lean: 0, twist: 0, roll: 0, crouch: 0, bounce: 0,
      armL: { sh: -0.9, shZ: 0.25, el: -1.7, wr: 0 }, armR: { sh: -0.9, shZ: -0.25, el: -1.7, wr: 0 },
      legL: { hip: 0, hipZ: 0.05, knee: 0 }, legR: { hip: 0, hipZ: -0.05, knee: 0 },
      bodyY: 0, fallX: 0, spin: 0,
    };
  }

  /** Reset the target pose to the guard stance (actions then modify it). */
  guard() {
    const t = this.target; const n = this._neutralPose();
    Object.assign(t, { ...n, armL: { ...n.armL }, armR: { ...n.armR }, legL: { ...n.legL }, legR: { ...n.legR } });
    return t;
  }

  flash(amount = 1) { this.fx.flash = Math.max(this.fx.flash, amount); }

  update(dt, t) {
    const k = this.stiffness;
    const P = this.pose, T = this.target;
    for (const key of ['lean', 'twist', 'roll', 'crouch', 'bounce', 'bodyY', 'fallX', 'spin']) P[key] = damp(P[key], T[key], k, dt);
    for (const limb of ['armL', 'armR', 'legL', 'legR']) {
      for (const j in T[limb]) P[limb][j] = damp(P[limb][j], T[limb][j], k, dt);
    }
    this.offset.x = damp(this.offset.x, this.offsetTarget.x, k * 0.8, dt);
    this.offset.y = damp(this.offset.y, this.offsetTarget.y, k * 0.8, dt);
    this.offset.z = damp(this.offset.z, this.offsetTarget.z, k * 0.8, dt);

    // apply
    this.bob.position.set(this.offset.x, this.offset.y + P.bounce + P.bodyY, this.offset.z);
    this.bob.rotation.set(P.fallX, P.spin, 0);
    this.hips.position.y = this.p.hipHeight - P.crouch;
    this.torso.rotation.set(P.lean, P.twist, P.roll);
    for (const side of ['L', 'R']) {
      const a = this.arms[side], ap = P['arm' + side];
      // shoulders follow the torso orientation
      a.shoulder.position.set(a.side * this.p.shoulderX, this.p.shoulderY, 0).applyEuler(this.torso.rotation);
      a.shoulder.rotation.set(ap.sh + P.lean, P.twist, ap.shZ + P.roll, 'YXZ');
      a.elbow.rotation.set(ap.el, 0, 0);
      a.wrist.rotation.set(ap.wr, 0, 0);
      const l = this.legs[side], lp = P['leg' + side];
      l.hip.rotation.set(lp.hip, 0, lp.hipZ);
      l.knee.rotation.set(lp.knee, 0, 0);
    }

    // hit flash on all registered materials
    if (this.fx.flash > 0.001) {
      this.fx.flash = Math.max(0, this.fx.flash - dt * 8);
      const f = this.fx.flash;
      for (const m of this.materials) {
        m.emissive.copy(m.userData.baseEmissive).lerp(_white, f * 0.55);
        m.emissiveIntensity = m.userData.baseEmissiveIntensity + f * 0.6;
      }
      this._flashing = true;
    } else if (this._flashing) {
      for (const m of this.materials) { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEmissiveIntensity; }
      this._flashing = false;
    }
  }

  /** World-space position of a fist (for effects). */
  fistWorld(side, out = new THREE.Vector3()) {
    return this.arms[side].fist.localToWorld(out.set(0, -this.p.fistSize, this.p.fistSize * 0.5));
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}
const _white = new THREE.Color(1, 1, 1);
