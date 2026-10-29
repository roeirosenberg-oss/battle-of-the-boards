// Final throne cinematic: first-person approach → turn and sit → first
// third-person cut → enemies enter, line up, kneel and bow → coronation,
// golden light, confetti, sparks, and the Hebrew title.
import * as THREE from 'three';
import { ENEMIES, FINAL_TITLE, PLAYER } from '../config.js';
import { Enemy } from '../enemies/enemy.js';
import { buildShir } from '../characters/shirModel.js';

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = t => Math.max(0, Math.min(1, t));

export class VictorySequence {
  constructor({ scene, world, cameraRig, hands, audio, ui, sparks, confetti, arcs }) {
    Object.assign(this, { scene, world, cameraRig, hands, audio, ui, sparks, confetti, arcs });
    this.active = false;
  }

  start(stats, onFinished) {
    this.active = true;
    this.t = 0;
    this.stats = stats;
    this.onFinished = onFinished;
    this.hall = this.world.throneHall;
    this.done = {};
    const H = this.hall;
    const L = (x, y, z) => H.toWorld(x, y, z);
    this.L = L;
    // first-person path: entrance → foot of the stairs → top of the platform
    this.fp = {
      start: this.cameraRig.eye.clone(),
      foot: L(0, PLAYER.eyeHeight, 5.2),
      top: L(0, PLAYER.eyeHeight + H.platformTop, 1.4),
      seatEye: L(0, H.platformTop + 1.1 + 0.62, 0.15),
      throneLook: L(0, H.platformTop + 1.6, 0),
      hallLook: L(0, H.platformTop + 1.2, 20),
    };
    this.hands.setMode('walk');
    this.cameraRig.walking = true;
    this.cameraRig.walkSpeed = 2.4;
    this.audio.playMusic('throne');
    this.ui.setHudVisible(false);
    this.ui.letterbox(true);
    this.ui.banner('THE THRONE AWAITS', 'victory', 2.2);
    H.setLit(0.35);
  }

  _spawnCast() {
    const H = this.hall;
    // Shir, seated
    this.shir = buildShir();
    this.shir.rig.root.position.copy(H.toWorld(0, H.platformTop + 1.12 - 0.5, 0.05));
    this.shir.rig.root.rotation.y = H.group.rotation.y;
    this.scene.add(this.shir.rig.root);
    // the five defeated enemies — fresh models, entering from the far end of the hall
    this.cast = ENEMIES.map((cfg, i) => {
      const e = new Enemy(cfg);
      e.alive = false;
      const startLocal = new THREE.Vector3(-2 + (i % 2) * 4, 0, 22 + i * 2.2);
      e.root.position.copy(H.toWorld(startLocal.x, 0, startLocal.z));
      e.root.rotation.y = H.group.rotation.y + Math.PI; // face the throne
      this.scene.add(e.root);
      e.setAction('idle');
      e.spot = H.toWorld(...H.enemySpotLocal(i).toArray());
      return e;
    });
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    const cam = this.cameraRig;
    const F = this.fp;
    const H = this.hall;

    // ---------------- Act 1: first-person (0 → 8.4 s) ----------------
    if (t < 8.4) {
      if (t < 3.0) {
        const k = ease(clamp01(t / 3.0));
        cam.setTargets(F.start.clone().lerp(F.foot, k), F.throneLook);
        cam.lookStiffness = 3;
      } else if (t < 4.6) {
        const k = ease(clamp01((t - 3.0) / 1.6));
        cam.setTargets(F.foot.clone().lerp(F.top, k), F.throneLook);
        if (!this.done.stairs) { this.done.stairs = true; H.setLit(0.6); this.audio.bell(); }
      } else if (t < 6.4) {
        // Shir turns around to face the hall
        cam.walking = false;
        this.hands.setMode('guard');
        const k = ease(clamp01((t - 4.6) / 1.8));
        const angle = Math.PI * k;
        const eye = F.top.clone();
        const dir = new THREE.Vector3().subVectors(F.throneLook, eye); dir.y = 0;
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle * (1));
        cam.setTargets(eye, eye.clone().add(dir.setLength(5)).setY(eye.y - 0.2 * k), true);
      } else {
        // …and sits on the throne, raising both fists
        const k = ease(clamp01((t - 6.4) / 1.4));
        cam.setTargets(F.top.clone().lerp(F.seatEye, k), F.hallLook, false);
        this.hands.setMode('cheer');
        if (!this.done.sit) { this.done.sit = true; this.audio.footstep('LEFT'); }
        if (t > 7.6 && !this.done.white) { this.done.white = true; this.ui.fadeToWhite(0.7); }
      }
      return;
    }

    // ---------------- Cut: first third-person view ----------------
    if (!this.done.cut) {
      this.done.cut = true;
      this.hands.setVisible(false);
      this._spawnCast();
      this.ui.flash(1.2, 1);
      this.cast.forEach((e, i) => {
        setTimeout(() => this.active && this.cast && e.walkTo(e.spot, 3.6, () => {
          e.faceTowards(this.shir.rig.root.position);
          e.setAction('idle', 0, { face: 'surprised' });
        }, null), i * 450);
      });
    }
    const tc = t - 8.4;
    const shirPos = this.shir.rig.root.position;
    const seat = H.toWorld(0, H.platformTop + 1.7, 0);
    const cheer = clamp01((tc - 16.2) / 0.8);
    this.shir.pose(t, cheer, tc > 11 && tc < 15.5 ? 1 : 0);
    if (tc > 16 && !this.done.crown) {
      this.done.crown = true;
      this.shir.crown.visible = true;
      const cp = this.shir.crown.getWorldPosition(new THREE.Vector3());
      this.sparks.burst(cp, { count: 120, colors: [0xffd36a, 0xffffff], speed: 3, life: 1, size: 0.12, gravity: -1 });
      this.audio.bell();
    }
    this.shir.rig.update(dt, t);
    this.shir.face.update(dt, t);
    this.shir.face.setExpression(tc < 9 ? 'smug' : 'happy');
    for (const e of this.cast) e.update(dt, null);

    // kneel + bow, staggered
    if (tc > 8.2 && !this.done.kneel) {
      this.done.kneel = true;
      this.cast.forEach((e, i) => setTimeout(() => { if (!this.active || !this.cast) return; if (e.walkTarget) { e.root.position.copy(e.spot); e.walkTarget = null; } e.faceTowards(shirPos); e.setAction('bow'); }, i * 280));
      this.audio.crowdCheer();
    }
    // micro:bit shows a heart while bowing
    const mb = this.cast[2];
    if (tc > 10.5 && mb.face.show) mb.face.show('heart');

    // golden lighting ramps up
    H.setLit(0.6 + 0.4 * clamp01((tc - 14) / 2));
    if (tc > 15.5 && !this.done.party) {
      this.done.party = true;
      H.celebrating = true;
      this.confetti.start(H.toWorld(0, 0, 9), 22, 20, 12);
      this.audio.fanfare();
    }
    if (this.done.party && Math.random() < dt * 6) {
      // sparks fountains + electrical arcs between the pillars
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = H.toWorld(side * 9, 4 + Math.random() * 6, 2 + Math.floor(Math.random() * 6) * 6.5);
      this.sparks.burst(p, { count: 30, colors: [0xffd36a, 0xffffff, 0x3cf2ff], speed: 4, life: 0.8, size: 0.14, gravity: -3 });
      if (Math.random() < 0.4) this.arcs.fire(p, H.toWorld(-side * 9, 4 + Math.random() * 6, 2 + Math.floor(Math.random() * 6) * 6.5), 0.25);
    }
    if (tc > 16.6 && !this.done.title) {
      this.done.title = true;
      this.ui.letterbox(false);
      this.ui.showFinalTitle(FINAL_TITLE);
      this.sparks.burst(seat, { count: 200, colors: [0xffd36a, 0xffffff, 0xffa31a], speed: 7, life: 1.2, size: 0.18, gravity: -2 });
      this.audio.spark(1);
    }
    if (tc > 19.5 && !this.done.stats) {
      this.done.stats = true;
      const s = this.stats || {};
      this.ui.showEndingStats(`${s.hits ?? 0} punches landed · max combo ${s.maxCombo ?? 0} · ${s.retries ?? 0} retries`);
    }
    if (tc > 22 && !this.done.buttons) {
      this.done.buttons = true;
      this.ui.showEndingButtons();
      this.onFinished?.();
    }

    // ---------------- camera shots ----------------
    let pos, look, fov = 50;
    if (tc < 4.5) {
      // establishing shot: low, wide, slow push toward the throne
      const k = ease(clamp01(tc / 4.5));
      pos = H.toWorld(3.5 - k * 2, 1.4 + k * 0.8, 17 - k * 5);
      look = seat.clone();
      fov = 55;
    } else if (tc < 8.4) {
      // tracking the enemies as they march in
      const k = clamp01((tc - 4.5) / 3.9);
      const mid = this.cast.reduce((a, e) => a.add(e.root.position), new THREE.Vector3()).multiplyScalar(1 / this.cast.length);
      pos = H.toWorld(10.5, 3.2, 12 - k * 4);
      look = mid.clone().setY(1.4);
      fov = 48;
    } else if (tc < 12.5) {
      // over Shir's shoulder: the enemies kneel and bow
      const k = clamp01((tc - 8.4) / 4);
      pos = H.toWorld(3.4 - k * 0.8, H.platformTop + 3.4, 1.2 + k * 0.6);
      look = H.toWorld(0, 0.7, 8.6);
      fov = 52;
    } else {
      // hero shot of the king: front, slow orbit
      const k = tc - 12.5;
      const a = Math.sin(k * 0.12) * 0.35;
      const r = 6.2 - Math.min(1.8, k * 0.3);
      pos = H.toWorld(Math.sin(a) * r, H.platformTop + 1.2 + Math.min(0.8, k * 0.08), Math.cos(a) * r);
      look = seat.clone().add(new THREE.Vector3(0, 0.55, 0));
      fov = 48;
    }
    cam.cinematic = { pos, look, fov };
  }

  stop() {
    this.active = false;
    this.cameraRig.cinematic = null;
    this.confetti.stop();
    this.ui.letterbox(false);
    this.hands.setVisible(true);
    if (this.hall) { this.hall.celebrating = false; this.hall.setLit(0.15); }
    if (this.shir) { this.scene.remove(this.shir.rig.root); this.shir.rig.dispose(); this.shir = null; }
    if (this.cast) { this.cast.forEach(e => e.dispose()); this.cast = null; }
  }
}
