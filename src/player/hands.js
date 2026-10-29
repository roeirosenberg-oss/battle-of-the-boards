// First-person arms and boxing gloves attached to the camera.
// Two-bone IK keeps shoulder → elbow → glove connected while punching.
// LEFT glove (blue) is always on the bottom-left, RIGHT glove (red) on the bottom-right.
import * as THREE from 'three';
import { PUNCH_ANIM } from '../config.js';
import { Emitter } from '../core/events.js';

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function capsuleBetween(mesh, a, b, baseLen) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
  mesh.scale.set(1, len / baseLen, 1);
}

class FPHand {
  constructor(side, parent) {
    this.side = side;                 // 'LEFT' | 'RIGHT'
    const s = side === 'LEFT' ? -1 : 1;
    this.s = s;
    this.group = new THREE.Group();
    parent.add(this.group);

    const gloveColor = side === 'LEFT' ? 0x1f5fe0 : 0xe0202c;
    const gloveM = new THREE.MeshStandardMaterial({ color: gloveColor, roughness: 0.32, metalness: 0.05, envMapIntensity: 1 });
    const cuffM = new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.6 });
    const goldM = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.25, metalness: 1 });
    const skinM = new THREE.MeshStandardMaterial({ color: 0xc98d6a, roughness: 0.6 });
    const tapeM = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
    const shirtM = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.7 });
    this.gloveM = gloveM;

    // glove (knuckles point to -Z)
    this.glove = new THREE.Group();
    const main = new THREE.Mesh(new THREE.SphereGeometry(0.075, 28, 20), gloveM);
    main.scale.set(1.0, 0.92, 1.25); main.position.z = -0.03;
    this.glove.add(main);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.068, 24, 16), gloveM);
    knuckle.scale.set(1.05, 0.9, 0.8); knuckle.position.set(0, 0.012, -0.075);
    this.glove.add(knuckle);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.06, 6, 12), gloveM);
    thumb.rotation.set(Math.PI / 2.3, 0, -s * 0.5);
    thumb.position.set(-s * 0.055, -0.025, -0.05);
    this.glove.add(thumb);
    const cuffDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(gloveColor).multiplyScalar(0.55), roughness: 0.45 });
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.09, 24), cuffDark);
    cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.075;
    this.glove.add(cuff);
    const cuffBand = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 8, 32), cuffM);
    cuffBand.position.z = 0.1;
    this.glove.add(cuffBand);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.061, 0.007, 8, 32), goldM);
    band.position.z = 0.035;
    this.glove.add(band);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.09), goldM);
    stripe.position.set(0, 0.068, -0.03);
    this.glove.add(stripe);
    this.group.add(this.glove);

    // arm segments (unit-length capsules stretched between joints)
    this.forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.2, 6, 14), skinM);
    this.tape = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 16), tapeM);
    this.upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 6, 14), shirtM);
    this.group.add(this.forearm, this.upper, this.tape);
    this._forearmBase = 0.2 + 0.068; this._upperBase = 0.2 + 0.09;

    // poses (camera space)
    this.shoulder = new THREE.Vector3(s * 0.3, -0.52, -0.02);
    this.rest = new THREE.Vector3(s * 0.27, -0.235, -0.48);
    this.punchTarget = new THREE.Vector3(s * 0.07, -0.1, -0.8);
    this.upperLen = 0.44; this.foreLen = 0.48;

    this.pos = this.rest.clone();
    this.rot = new THREE.Euler();
    this.state = 'idle';
    this.stateT = 0;
    this.queued = null;
    this.strength = 1;
    this.impactFired = false;
    this.from = this.rest.clone();
    this.jolt = new THREE.Vector3();
    this.mode = 'guard'; // 'guard' | 'walk' | 'cheer' | 'hidden'
  }

  punch(strength01) {
    if (this.state === 'extend') { this.queued = strength01; return; }
    this.from.copy(this.pos);
    this.state = 'extend';
    this.stateT = 0;
    this.strength = strength01;
    this.impactFired = false;
  }

  /** Fist tip position in world space. */
  tipWorld(out = new THREE.Vector3()) {
    this.glove.updateMatrixWorld(true);
    return this.glove.localToWorld(out.set(0, 0, -0.13));
  }

  update(dt, t, ctx, onImpact) {
    const ext = PUNCH_ANIM.extendMs / 1000, hold = PUNCH_ANIM.holdMs / 1000, ret = PUNCH_ANIM.retractMs / 1000;
    this.stateT += dt;

    // resting pose depends on mode (guard / walking / cheering)
    const restNow = this.rest.clone();
    if (this.mode === 'walk') {
      restNow.y += -0.05 + Math.sin(ctx.stepPhase + (this.s > 0 ? Math.PI : 0)) * 0.025;
      restNow.z += Math.sin(ctx.stepPhase + (this.s > 0 ? Math.PI : 0)) * 0.04;
      restNow.x += this.s * 0.02;
    } else if (this.mode === 'cheer') {
      restNow.set(this.s * 0.32, 0.06 + Math.abs(Math.sin(t * 7 + this.s)) * 0.07, -0.72);
    } else if (this.mode === 'hidden') {
      restNow.set(this.s * 0.3, -0.8, -0.2);
    } else {
      // boxing guard bob
      restNow.y += Math.sin(t * 4.2 + (this.s > 0 ? 0.6 : 0)) * 0.012;
      restNow.x += Math.sin(t * 2.1) * 0.006;
    }

    const rp = this.mode === 'cheer' ? 1.3 : (this.mode === 'walk' ? 0.45 : 0.7); // knuckles up in guard
    let target = restNow, roll = 0, pitch = rp, fireImpact = false;
    const reach = 0.85 + this.strength * 0.2;
    const punchAt = this.punchTarget.clone();
    punchAt.z *= reach;
    if (this.state === 'extend') {
      const k = Math.min(1, this.stateT / ext);
      const e = easeOutCubic(k);
      target = this.from.clone().lerp(punchAt, e);
      roll = -this.s * 1.25 * e;   // corkscrew: palm turns down
      pitch = rp * (1 - e) - 0.05 * e;
      if (!this.impactFired && k >= PUNCH_ANIM.impactAt) {
        this.impactFired = true;
        fireImpact = true;
      }
      if (k >= 1) { this.state = 'hold'; this.stateT = 0; }
      this.pos.copy(target);
    } else if (this.state === 'hold') {
      target = punchAt; roll = -this.s * 1.25; pitch = -0.05;
      this.pos.copy(target);
      if (this.stateT >= hold) { this.state = 'retract'; this.stateT = 0; }
    } else if (this.state === 'retract') {
      const k = Math.min(1, this.stateT / ret);
      const e = easeInOutQuad(k);
      target = punchAt.clone().lerp(restNow, e);
      roll = -this.s * 1.25 * (1 - e); pitch = -0.05 + (rp + 0.05) * e;
      this.pos.copy(target);
      if (k >= 1) {
        this.state = 'idle';
        if (this.queued !== null) { const q = this.queued; this.queued = null; this.punch(q); }
      }
    } else {
      this.pos.lerp(restNow, 1 - Math.exp(-12 * dt));
      if (this.queued !== null) { const q = this.queued; this.queued = null; this.punch(q); }
    }

    // jolt from taking damage (decays)
    this.jolt.multiplyScalar(Math.exp(-8 * dt));
    const p = this.pos.clone().add(this.jolt);

    this.glove.position.copy(p);
    this.glove.rotation.set(pitch, this.s * 0.18, roll + this.s * 0.15, 'YXZ');

    // IK: shoulder → elbow → wrist
    const wrist = new THREE.Vector3(0, 0, 0.1).applyEuler(this.glove.rotation).add(p);
    const S = this.shoulder;
    const dir = new THREE.Vector3().subVectors(wrist, S);
    let d = dir.length();
    const a = this.upperLen, b = this.foreLen;
    d = Math.min(d, a + b - 0.002);
    dir.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const pole = new THREE.Vector3(this.s * 0.8, -1, 0.3).normalize();
    const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const elbow = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
    capsuleBetween(this.upper, S, elbow, this._upperBase);
    capsuleBetween(this.forearm, elbow, wrist, this._forearmBase);
    // tape wrap near the wrist
    const tapePos = wrist.clone().lerp(elbow, 0.12);
    this.tape.position.copy(tapePos);
    this.tape.quaternion.copy(this.forearm.quaternion);
    if (fireImpact) onImpact?.(this);
  }
}

export class Hands extends Emitter {
  constructor(camera) {
    super();
    this.camera = camera;
    this.root = new THREE.Group();
    camera.add(this.root);
    this.left = new FPHand('LEFT', this.root);
    this.right = new FPHand('RIGHT', this.root);
    // soft key light so the gloves look good in every zone
    this.light = new THREE.PointLight(0xffffff, 0.7, 2.2, 1.5);
    this.light.position.set(0, 0.25, -0.1);
    camera.add(this.light);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    this.t = 0;
    this.stepPhase = 0;
  }

  hand(side) { return side === 'LEFT' ? this.left : this.right; }

  /** Trigger a punch animation. strength01: 0 (weak) .. 1 (strong). */
  punch(side, strength01 = 0.5) {
    this.hand(side).punch(strength01);
  }

  setMode(mode) { this.left.mode = mode; this.right.mode = mode; }

  takeHit(dirX = 0) {
    for (const h of [this.left, this.right]) h.jolt.set(dirX * 0.05 + (Math.random() - 0.5) * 0.04, -0.06, 0.08);
  }

  update(dt, stepPhase) {
    this.t += dt;
    const ctx = { stepPhase };
    const onImpact = (h) => this.emit('impact', { hand: h.side, strength01: h.strength, tip: h.tipWorld() });
    this.left.update(dt, this.t, ctx, onImpact);
    this.right.update(dt, this.t, ctx, onImpact);
  }

  setVisible(v) { this.root.visible = v; this.light.visible = v; }
}
