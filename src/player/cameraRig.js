// First-person camera: eye height, smooth look-at, walking head-bob and footsteps,
// trauma-based shake, punch / hit kicks. Also supports a cinematic override.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { Emitter } from '../core/events.js';

export class CameraRig extends Emitter {
  constructor(camera) {
    super();
    this.camera = camera;
    this.eye = new THREE.Vector3(0, PLAYER.eyeHeight, 0);
    this.eyeTarget = this.eye.clone();
    this.look = new THREE.Vector3(0, PLAYER.eyeHeight, -10);
    this.lookTarget = this.look.clone();
    this.walking = false;
    this.walkSpeed = 0;
    this.stepPhase = 0;
    this._lastStepSign = 1;
    this.trauma = 0;
    this.kick = new THREE.Vector3();      // positional kick
    this.kickRot = new THREE.Vector3();   // pitch, yaw, roll kick
    this.baseFov = 72;
    this.fovKick = 0;
    this.cinematic = null;               // {pos, look, fov}
    this.lookStiffness = 5;
    this._n = 0;
  }

  setTargets(eye, look, snap = false) {
    this.eyeTarget.copy(eye);
    this.lookTarget.copy(look);
    if (snap) { this.eye.copy(eye); this.look.copy(look); }
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  punchKick(side, strength01) {
    const s = side === 'LEFT' ? -1 : 1;
    this.kickRot.y += -s * 0.012 * (0.6 + strength01);
    this.kickRot.z += s * 0.01 * (0.6 + strength01);
    this.kick.z -= 0.02 * (0.5 + strength01);
    this.fovKick -= 1.2 * (0.5 + strength01);
  }

  hitKick(dirX = 0) {
    this.kickRot.x += 0.06; this.kickRot.z += dirX * 0.08 + (Math.random() - 0.5) * 0.05;
    this.kick.z += 0.08;
    this.fovKick += 4;
    this.shake(0.55);
  }

  update(dt) {
    this._n += dt;
    if (this.cinematic) {
      const c = this.cinematic;
      this.camera.position.copy(c.pos);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(c.look);
      this.camera.fov = c.fov ?? this.baseFov;
      this.camera.updateProjectionMatrix();
      return;
    }
    const k = 1 - Math.exp(-6 * dt);
    this.eye.lerp(this.eyeTarget, k);
    this.look.lerp(this.lookTarget, 1 - Math.exp(-this.lookStiffness * dt));

    // walking bob + footstep events
    const bob = new THREE.Vector3();
    if (this.walking && this.walkSpeed > 0.1) {
      this.stepPhase += dt * this.walkSpeed * 2.1;
      bob.y = Math.abs(Math.sin(this.stepPhase)) * 0.045 - 0.02;
      bob.x = Math.sin(this.stepPhase * 0.5) * 0.025;
      const sign = Math.sign(Math.sin(this.stepPhase));
      if (sign !== this._lastStepSign) { this._lastStepSign = sign; this.emit('footstep', { side: sign > 0 ? 'LEFT' : 'RIGHT' }); }
    } else {
      bob.y = Math.sin(this._n * 1.6) * 0.006; // breathing
    }

    // decay kicks
    this.kick.multiplyScalar(Math.exp(-10 * dt));
    this.kickRot.multiplyScalar(Math.exp(-9 * dt));
    this.fovKick *= Math.exp(-8 * dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const n = this._n * 38;
    const shake = new THREE.Vector3(Math.sin(n * 1.1) * 0.06, Math.sin(n * 1.7 + 2) * 0.05, 0).multiplyScalar(sh);

    // basis vectors
    const fwd = new THREE.Vector3().subVectors(this.look, this.eye).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const pos = this.eye.clone()
      .addScaledVector(right, bob.x + shake.x)
      .add(new THREE.Vector3(0, bob.y + shake.y, 0))
      .addScaledVector(fwd, -this.kick.z);
    this.camera.position.copy(pos);
    const lookAt = this.look.clone().addScaledVector(right, shake.x * 0.5);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(lookAt);
    this.camera.rotateX(this.kickRot.x + Math.sin(n * 0.9) * 0.02 * sh);
    this.camera.rotateY(this.kickRot.y);
    this.camera.rotateZ(this.kickRot.z + Math.sin(n * 1.3) * 0.03 * sh + (this.walking ? Math.sin(this.stepPhase * 0.5) * 0.006 : 0));
    this.camera.fov = this.baseFov + this.fovKick;
    this.camera.updateProjectionMatrix();
  }
}
