// Enemy presentation + action animation (walk, guard, wind-up, strike, hit,
// dodge, knockout, bow…). Decision making lives in enemyAI.js.
import * as THREE from 'three';
import { MODEL_BUILDERS } from './models.js';
import { Emitter } from '../core/events.js';

const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export class Enemy extends Emitter {
  constructor(config) {
    super();
    this.config = config;
    const m = MODEL_BUILDERS[config.model]();
    this.model = m;
    this.rig = m.rig;
    this.face = m.face;
    this.root = this.rig.root;
    this.root.scale.setScalar(config.scale);
    this.health = config.maxHealth;
    this.alive = true;
    this.action = 'idle';
    this.actionT = 0;
    this.actionDur = 0;
    this.actionData = {};
    this.phase = 0;
    this.t = Math.random() * 10;
    this.walkTarget = null;
    this.walkSpeed = 1.4;
    this.invulnerable = false;
    this._strikeFired = false;
    this.face.setExpression('idle');
  }

  get lookHeight() { return this.model.lookHeight * this.config.scale; }

  setAction(name, dur = 0, data = {}) {
    this.action = name;
    this.actionT = 0;
    this.actionDur = dur;
    this.actionData = data;
    this._strikeFired = false;
    const faceFor = { idle: 'idle', walk: 'idle', taunt: 'angry', windup: 'attack', strike: 'attack', recover: 'angry', hit: 'hurt', dodge: 'smug', ko: 'ko', phase: 'angry', kneel: 'bow', bow: 'bow', cheer: 'happy', intro: 'angry', surprised: 'surprised' };
    this.face.setExpression(data.face || faceFor[name] || 'idle');
  }

  /** Walk (with animated legs) to a world position, then call onArrive. */
  walkTo(pos, speed = 1.4, onArrive = null, lookAt = null) {
    this.walkTarget = pos.clone();
    this.walkSpeed = speed;
    this._onArrive = onArrive;
    this._walkLook = lookAt ? lookAt.clone() : null;
    this.setAction('walk');
  }

  faceTowards(p) {
    const q = new THREE.Vector3(p.x, this.root.position.y, p.z);
    this.root.lookAt(q);
  }

  update(dt, lookTarget) {
    this.t += dt;
    this.actionT += dt;
    const t = this.t, a = this.action, rig = this.rig;
    const k = this.actionDur > 0 ? Math.min(1, this.actionT / this.actionDur) : 0;
    const T = rig.guard();
    rig.stiffness = 14;
    rig.offsetTarget.set(0, 0, 0);
    const side = this.actionData.side || 'R';
    const armKey = side === 'L' ? 'armL' : 'armR';
    const other = side === 'L' ? 'armR' : 'armL';
    const sgn = side === 'L' ? 1 : -1;

    // breathing / boxing bounce (most actions)
    const bounceAmp = this.config.id === 'microbit' ? 0.05 : 0.03;
    T.bounce = Math.abs(Math.sin(t * (this.config.id === 'microbit' ? 7 : 5))) * bounceAmp;
    T.armL.sh += Math.sin(t * 5) * 0.06; T.armR.sh += Math.sin(t * 5 + 1.5) * 0.06;
    T.twist = Math.sin(t * 1.7) * 0.06;

    switch (a) {
      case 'walk': {
        T.bounce = Math.abs(Math.sin(t * 9)) * 0.05;
        const sw = Math.sin(t * 9);
        T.legL.hip = sw * 0.55; T.legR.hip = -sw * 0.55;
        T.legL.knee = Math.max(0, -sw) * 0.7; T.legR.knee = Math.max(0, sw) * 0.7;
        T.armL.sh = -0.5 - sw * 0.3; T.armR.sh = -0.5 + sw * 0.3;
        T.armL.el = -1.2; T.armR.el = -1.2;
        if (this.walkTarget) {
          const to = new THREE.Vector3().subVectors(this.walkTarget, this.root.position); to.y = 0;
          const dist = to.length();
          const step = this.walkSpeed * dt;
          if (dist <= step) {
            this.root.position.x = this.walkTarget.x; this.root.position.z = this.walkTarget.z;
            this.walkTarget = null;
            this.setAction('idle');
            const cb = this._onArrive; this._onArrive = null;
            cb?.();
          } else {
            to.normalize();
            this.root.position.addScaledVector(to, step);
            const look = this._walkLook || this.root.position.clone().add(to);
            this.faceTowards(look);
          }
        }
        break;
      }
      case 'taunt':
      case 'intro': {
        // arms up, shaking fists, body shimmy
        T.armL.sh = -2.6 + Math.sin(t * 14) * 0.25; T.armR.sh = -2.6 + Math.sin(t * 14 + 1) * 0.25;
        T.armL.shZ = 0.6; T.armR.shZ = -0.6;
        T.armL.el = -0.6; T.armR.el = -0.6;
        T.roll = Math.sin(t * 8) * 0.12;
        T.bounce = Math.abs(Math.sin(t * 8)) * 0.08;
        break;
      }
      case 'windup': {
        // pull the punching arm back, lean back, twist away
        const e = ease(k);
        T[armKey].sh = -0.55 - e * 0.25; T[armKey].el = -2.3; T[armKey].shZ = sgn * 0.5;
        T.twist = sgn * 0.45 * e;
        T.lean = -0.18 * e;
        T.crouch = 0.05 * e;
        rig.offsetTarget.z = -0.12 * e;
        // telegraph: trembling
        T.roll = Math.sin(t * 50) * 0.02 * e;
        break;
      }
      case 'strike': {
        rig.stiffness = 38;
        T[armKey].sh = -1.62; T[armKey].el = -0.05; T[armKey].shZ = -sgn * 0.12;
        T[other].sh = -1.0; T[other].el = -1.9;
        T.twist = -sgn * 0.35;
        T.lean = 0.22;
        rig.offsetTarget.z = 0.38 * (this.actionData.lunge ?? 1);
        if (!this._strikeFired && k >= 0.55) {
          this._strikeFired = true;
          this.emit('strikeImpact', { side, data: this.actionData });
        }
        break;
      }
      case 'recover': {
        T.lean = 0.05 * (1 - k);
        break;
      }
      case 'hit': {
        rig.stiffness = 30;
        const from = this.actionData.from === 'LEFT' ? 1 : -1; // player's left fist lands on enemy's right side
        const e = 1 - k;
        T.lean = -0.35 * e;
        T.roll = from * 0.25 * e;
        T.twist = from * 0.3 * e;
        T.armL.sh = -0.6; T.armR.sh = -0.6; T.armL.el = -1.0; T.armR.el = -1.0;
        rig.offsetTarget.z = -0.22 * e;
        rig.offsetTarget.x = -from * 0.06 * e;
        break;
      }
      case 'dodge': {
        rig.stiffness = 26;
        const dir = this.actionData.dir ?? 1;
        const e = Math.sin(Math.PI * Math.min(1, k * 1.1));
        rig.offsetTarget.x = dir * 0.85 * e;
        T.roll = -dir * 0.35 * e;
        T.crouch = 0.12 * e;
        T.legL.knee = 0.4 * e; T.legR.knee = 0.4 * e;
        break;
      }
      case 'phase': {
        // boss power-up roar
        T.armL.sh = -2.9; T.armR.sh = -2.9; T.armL.shZ = 0.9; T.armR.shZ = -0.9; T.armL.el = -0.3; T.armR.el = -0.3;
        T.lean = -0.25; T.bounce = Math.abs(Math.sin(t * 25)) * 0.04;
        T.roll = Math.sin(t * 30) * 0.03;
        break;
      }
      case 'ko': {
        rig.stiffness = 6;
        const boss = this.config.boss;
        const delay = boss ? 1.4 : 0.15;
        if (this.actionT < delay) {
          // stagger in place (boss shakes violently)
          T.lean = -0.2; T.roll = Math.sin(t * (boss ? 40 : 18)) * (boss ? 0.12 : 0.2);
          T.armL.sh = -0.3; T.armR.sh = -0.3; T.armL.el = -0.2; T.armR.el = -0.2;
        } else {
          const e = Math.min(1, (this.actionT - delay) / 0.7);
          T.fallX = -1.45 * ease(e);
          T.bodyY = -0.02;
          T.armL.sh = -2.7; T.armR.sh = -2.5; T.armL.shZ = 1.2; T.armR.shZ = -1.0; T.armL.el = -0.1; T.armR.el = -0.4;
          T.legL.hip = -0.4 * e; T.legR.hip = -0.1;
          T.legL.knee = 0.4 * e;
          T.lean = 0;
          rig.offsetTarget.z = -0.5 * e;
          if (!this._koLanded && e >= 1) { this._koLanded = true; this.emit('koLanded'); }
        }
        T.bounce = 0;
        break;
      }
      case 'kneel':
      case 'bow': {
        // kneel on one knee, then bow the torso
        rig.stiffness = 5;
        const e = ease(Math.min(1, this.actionT / 1.2));
        const h = this.rig.p;
        T.crouch = (h.legUpper + h.legLower) * 0.45 * e;
        T.legL.hip = -1.5 * e; T.legL.knee = 1.6 * e;
        T.legR.hip = 0.3 * e; T.legR.knee = 1.9 * e;
        const bowK = a === 'bow' ? ease(Math.min(1, Math.max(0, (this.actionT - 1.0) / 1.0))) : 0;
        T.lean = 0.75 * bowK;
        T.armL.sh = -0.3 - bowK * 0.4; T.armL.el = -0.4; T.armL.shZ = 0.1;
        T.armR.sh = -1.3 * (1 - bowK) - 0.6 * bowK; T.armR.el = -2.0 * (1 - bowK); T.armR.shZ = -0.2;
        T.bounce = 0;
        T.twist = 0;
        break;
      }
      case 'cheer': {
        T.armL.sh = -2.8 + Math.sin(t * 9) * 0.3; T.armR.sh = -2.8 + Math.cos(t * 9) * 0.3;
        T.armL.el = -0.2; T.armR.el = -0.2;
        T.bounce = Math.abs(Math.sin(t * 9)) * 0.12;
        break;
      }
      default: break;
    }

    if (this.actionDur > 0 && this.actionT >= this.actionDur && !['ko', 'walk', 'kneel', 'bow'].includes(a)) {
      const done = a; this.setAction('idle');
      this.emit('actionDone', done);
    }

    if (lookTarget && a !== 'walk' && a !== 'ko') {
      // smoothly turn to face the target
      const desired = Math.atan2(lookTarget.x - this.root.position.x, lookTarget.z - this.root.position.z);
      let diff = desired - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.set(0, this.root.rotation.y + diff * (1 - Math.exp(-6 * dt)), 0);
    }

    rig.update(dt, t);
    this.face.update(dt, t);
    this.model.update?.(dt, t, { phase: this.phase, action: a });
  }

  /** World positions of hurtboxes (sphere centres) with world radius. */
  hurtSpheres() {
    const s = this.config.scale;
    return this.rig.hurtboxes.map(h => ({ center: h.obj.getWorldPosition(new THREE.Vector3()), radius: h.radius * s }));
  }

  dispose() { this.rig.dispose(); }
}
