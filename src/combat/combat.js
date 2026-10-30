// Combat logic: player punches → hit detection → damage; enemy attacks → player
// damage; knockouts, defeat, combo counter, effects and feedback.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { Emitter } from '../core/events.js';
import { testPunch } from './hitDetection.js';
import { settings, DIFFICULTY } from '../core/settings.js';

/** Map detected accelerometer strength (mg) to 0..1. */
export function strengthTo01(mg) {
  return THREE.MathUtils.clamp((mg - PLAYER.strengthLow) / (PLAYER.strengthHigh - PLAYER.strengthLow), 0, 1);
}

export class Combat extends Emitter {
  constructor({ engine, hands, cameraRig, audio, ui, sparks, arcs }) {
    super();
    Object.assign(this, { engine, hands, cameraRig, audio, ui, sparks, arcs });
    this.state = 'idle';        // idle | fighting | ko | defeat
    this.enemy = null;
    this.ai = null;
    this.playerHealth = PLAYER.maxHealth;
    this.pendingDodge = { LEFT: false, RIGHT: false };
    this.combo = 0;
    this.lastHitTime = 0;
    this.lastHitHand = null;
    this.stats = { hits: 0, misses: 0, damageDealt: 0, damageTaken: 0, maxCombo: 0 };
    this._timers = [];
    this._time = 0;

    hands.on('impact', (e) => this._onImpact(e));
  }

  get diff() { return DIFFICULTY[settings.get('difficulty')] || DIFFICULTY.normal; }

  _after(sec, fn) { this._timers.push({ at: this._time + sec, fn }); }

  startFight(enemy, ai) {
    this.enemy = enemy;
    this.ai = ai;
    this.state = 'fighting';
    this.combo = 0;
    this.pendingDodge = { LEFT: false, RIGHT: false };
    this._offs?.forEach(off => off());
    this._offs = [
      enemy.on('strikeImpact', (e) => this._onEnemyStrike(e)),
      ai.on('windup', (e) => this._onWindup(e)),
      ai.on('phase', (e) => this._onPhase(e)),
      ai.on('dodge', () => this.ui.popup('DODGED!', 'miss')),
      ai.on('staggered', () => this.ui.popup('INTERRUPTED!', 'combo')),
    ];
    ai.start();
  }

  stop() {
    this.state = 'idle';
    this.ai?.stop();
    this._offs?.forEach(off => off());
    this._offs = null;
    this._timers = [];
  }

  /** Every accepted punch event (hardware or test input) goes through here. */
  onPunchInput(hand, strengthMg, canPunch = true) {
    if (!canPunch) return;
    const s01 = strengthTo01(strengthMg);
    this.hands.punch(hand, s01);
    this.audio.punch(hand, s01);
    this.cameraRig.punchKick(hand, s01);
    if (this.state === 'fighting' && this.ai) {
      this.pendingDodge[hand] = this.ai.considerDodge(hand);
    } else {
      this.pendingDodge[hand] = false;
    }
    this._lastStrengthMg = { ...(this._lastStrengthMg || {}), [hand]: strengthMg };
  }

  _onImpact({ hand, strength01, tip }) {
    if (this.state !== 'fighting' || !this.enemy?.alive) return;
    const enemy = this.enemy;
    const dodged = this.pendingDodge[hand];
    this.pendingDodge[hand] = false;
    if (enemy.invulnerable) {
      this.sparks.burst(tip, { count: 14, colors: [0x9ff6ff, 0xffffff], speed: 3, life: 0.3, size: 0.08 });
      this.audio.spark(0.4);
      this.ui.popup('SHIELDED!', 'miss');
      return;
    }
    const dir = this.cameraRig.camera.getWorldDirection(new THREE.Vector3());
    const res = dodged ? { hit: false } : testPunch(tip, dir, enemy);
    if (!res.hit) {
      this.stats.misses++;
      this.combo = 0;
      this.audio.miss(hand);
      if (!dodged) this.ui.popup('MISS', 'miss');
      this.ui.setCombo(0);
      return;
    }

    // ---- valid hit ----
    const now = this._time;
    if (now - this.lastHitTime < 1.3) this.combo++; else this.combo = 1;
    const alternated = this.lastHitHand && this.lastHitHand !== hand;
    this.lastHitTime = now; this.lastHitHand = hand;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    const strengthMult = THREE.MathUtils.lerp(PLAYER.minStrengthMult, PLAYER.maxStrengthMult, strength01);
    const comboMult = 1 + Math.min(0.25, (this.combo - 1) * 0.04) + (alternated ? 0.05 : 0);
    const counterMult = (enemy.action === 'windup') ? 1.25 : 1; // punish the wind-up
    let dmg = PLAYER.baseDamage * strengthMult * comboMult * counterMult * this.diff.playerDamage;
    dmg = Math.max(1, Math.round(dmg));
    enemy.health = Math.max(0, enemy.health - dmg);
    this.stats.hits++; this.stats.damageDealt += dmg;

    // feedback
    enemy.rig.flash(0.9);
    const pan = hand === 'LEFT' ? -0.3 : 0.3;
    this.audio.hit(strength01, pan);
    this.audio.enemyHurt(enemy.config.hurtVoice);
    const big = strength01 > 0.7;
    this.sparks.burst(res.point, { count: big ? 60 : 34, colors: [0xffe08a, 0xffffff, 0xff9a3a, 0x9ff6ff], speed: big ? 6 : 4.2, life: 0.45, size: big ? 0.16 : 0.12, gravity: -5 });
    this.sparks.burst(res.point, { count: 10, colors: [0x7ff9ff], speed: 1.2, life: 0.8, size: 0.25, gravity: 0 });
    this.cameraRig.shake(0.18 + strength01 * 0.22);
    if (big) this._hitstop(0.05);
    this.ui.damageNumber(dmg, res.point, big);
    if (this.combo >= 3) this.ui.setCombo(this.combo);
    if (counterMult > 1) this.ui.popup('COUNTER!', 'combo');
    this.emit('hit', { hand, dmg, health: enemy.health, point: res.point.clone(), strength01 });
    this.ui.setEnemyHealth(enemy.health / enemy.config.maxHealth);

    if (enemy.health <= 0) this._knockout();
    else this.ai.onHit(hand);
  }

  _hitstop(sec) {
    this.engine.timeScale = 0.05;
    setTimeout(() => { if (this.engine.timeScale === 0.05) this.engine.timeScale = this._baseScale ?? 1; }, sec * 1000);
  }

  _onWindup({ spark }) {
    this.audio.enemyWindup();
    if (spark) { this.audio.spark(0.8); this.ui.popup('⚡ SPARK ATTACK!', 'warn'); }
  }

  _onPhase({ phase, label }) {
    this.audio.phaseRoar();
    this.cameraRig.shake(0.6);
    this.ui.banner(label, 'phase', 1.6);
    const e = this.enemy;
    const c = e.root.position.clone().add(new THREE.Vector3(0, e.lookHeight, 0));
    for (let i = 0; i < 6; i++) {
      const to = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6));
      this.arcs.fire(c, to, 0.5);
    }
    this.sparks.burst(c, { count: 120, colors: [0x3cf2ff, 0xb06bff, 0xffffff], speed: 7, life: 0.9, size: 0.18, gravity: -2 });
    this.emit('phase', { phase });
  }

  _onEnemyStrike({ side, data }) {
    if (this.state !== 'fighting' || !this.enemy?.alive) return; // defeated enemies cannot attack
    const e = this.enemy;
    const phaseMult = 1 + (e.phase || 0) * 0.15;
    let dmg = e.config.attackDamage * (data.spark ? 1.4 : 1) * this.diff.enemyDamage * phaseMult;
    dmg = Math.round(dmg * (0.9 + Math.random() * 0.2));
    this.playerHealth = Math.max(0, this.playerHealth - dmg);
    this.stats.damageTaken += dmg;
    this.combo = 0; this.ui.setCombo(0);
    const dirX = side === 'L' ? 1 : -1; // enemy's left fist comes from screen-right
    this.cameraRig.hitKick(dirX);
    this.hands.takeHit(dirX);
    this.audio.enemyAttack();
    this.audio.playerHurt();
    this.ui.playerHurt(dmg, data.spark);
    this.ui.setPlayerHealth(this.playerHealth / PLAYER.maxHealth);
    const fist = e.rig.fistWorld(side);
    if (data.spark) {
      const cam = this.cameraRig.camera.getWorldPosition(new THREE.Vector3());
      for (let i = 0; i < 4; i++) this.arcs.fire(fist, cam.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.3 + Math.random() * 0.4, 0)), 0.3);
      this.audio.spark(1.2);
    }
    this.sparks.burst(fist, { count: 25, colors: [0xff5a5a, 0xffd27a], speed: 3, life: 0.35, size: 0.1 });
    if (this.playerHealth <= 0) this._defeat();
  }

  _knockout() {
    const e = this.enemy;
    e.alive = false;
    this.ai.stop();
    this.state = 'ko';
    e.setAction('ko');
    this.audio.ko(!!e.config.boss);
    this.ui.banner('K.O.!', 'ko', 1.8);
    this.cameraRig.shake(0.7);
    this._baseScale = 0.35;
    this.engine.timeScale = 0.35;
    setTimeout(() => { this.engine.timeScale = 1; this._baseScale = 1; }, 900);
    const c = e.root.position.clone().add(new THREE.Vector3(0, e.lookHeight * 0.8, 0));
    this.sparks.burst(c, { count: 160, colors: [0xffe08a, 0xffffff, 0x3cf2ff, 0xff4d6d], speed: 8, life: 1.0, size: 0.2, gravity: -4 });
    if (e.config.boss) {
      // chain of electrical explosions before the final fall
      for (let i = 0; i < 7; i++) {
        this._after(i * 0.22, () => {
          const p = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.3) * 1.6, (Math.random() - 0.5) * 0.6));
          this.sparks.burst(p, { count: 70, colors: [0x3cf2ff, 0xffffff, 0xffb02e], speed: 6, life: 0.7, size: 0.2 });
          this.arcs.fire(p, p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4)), 0.3);
          this.audio.spark(0.8);
          this.cameraRig.shake(0.35);
        });
      }
    }
    const off = e.on('koLanded', () => {
      off();
      this.sparks.burst(e.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), { count: 60, colors: [0xbfbfbf, 0xffffff], speed: 3, life: 0.8, size: 0.25, gravity: -1 });
      this.cameraRig.shake(0.3);
      this._after(1.1, () => this.emit('victory', { stats: { ...this.stats } }));
    });
  }

  _defeat() {
    this.state = 'defeat';
    this.ai.stop();
    this.enemy.setAction('cheer');
    this.ui.banner('YOU WERE KNOCKED OUT', 'defeat', 2);
    this._after(1.6, () => this.emit('defeat'));
  }

  resetPlayerHealth(full = true) {
    if (full) this.playerHealth = PLAYER.maxHealth;
    this.ui.setPlayerHealth(this.playerHealth / PLAYER.maxHealth);
  }

  healAfterVictory() {
    const missing = PLAYER.maxHealth - this.playerHealth;
    this.playerHealth = Math.min(PLAYER.maxHealth, Math.round(this.playerHealth + missing * PLAYER.healAfterWin + 10));
    this.ui.setPlayerHealth(this.playerHealth / PLAYER.maxHealth);
  }

  update(dt) {
    this._time += dt;
    if (this._timers.length) {
      const due = this._timers.filter(t => t.at <= this._time);
      this._timers = this._timers.filter(t => t.at > this._time);
      for (const t of due) t.fn();
    }
    // charge arcs around the fist during a spark wind-up
    const e = this.enemy;
    if (e && e.alive && e.action === 'windup' && e.actionData.spark && Math.random() < dt * 25) {
      const f = e.rig.fistWorld(e.actionData.side || 'R');
      this.arcs.fire(f, f.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7)), 0.1);
      if (e.model.horns) {
        const h = e.model.horns[Math.floor(Math.random() * 2)].getWorldPosition(new THREE.Vector3());
        this.arcs.fire(h, f, 0.12);
      }
    }
    // boss idle crackle
    if (e && e.alive && e.config.boss && e.model.horns && Math.random() < dt * (1.5 + e.phase * 2)) {
      const h0 = e.model.horns[0].getWorldPosition(new THREE.Vector3());
      const h1 = e.model.horns[1].getWorldPosition(new THREE.Vector3());
      this.arcs.fire(h0, h1, 0.15);
    }
  }
}
