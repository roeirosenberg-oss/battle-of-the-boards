// Enemy AI: decides when to attack, combos, dodges, counters, staggers and boss phases.
import { Emitter } from '../core/events.js';

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

export class EnemyAI extends Emitter {
  /**
   * @param {import('./enemy.js').Enemy} enemy
   * @param {{enemySpeed:number}} difficulty
   */
  constructor(enemy, difficulty) {
    super();
    this.enemy = enemy;
    this.cfg = enemy.config;
    this.diff = difficulty;
    this.active = false;
    this.timer = 1.6;
    this.comboLeft = 0;
    this.nextSide = 'R';
    this.pendingCounter = false;
    this.spark = false;

    enemy.on('actionDone', (name) => this._onActionDone(name));
  }

  start() { this.active = true; this.timer = 1.4 * this.diff.enemySpeed; }
  stop() { this.active = false; this.comboLeft = 0; }

  get phaseCfg() { return this.cfg.phases ? this.cfg.phases[this.enemy.phase] : null; }

  _interval() {
    const [a, b] = this.cfg.attackInterval;
    const m = (this.phaseCfg?.intervalMult ?? 1) * this.diff.enemySpeed;
    return rand(a, b) * m;
  }

  get busy() {
    return ['windup', 'strike', 'hit', 'dodge', 'phase', 'ko', 'recover', 'intro'].includes(this.enemy.action);
  }

  update(dt) {
    if (!this.active || !this.enemy.alive) return;
    if (this.busy) return;
    this.timer -= dt;
    if (this.pendingCounter) {
      this.pendingCounter = false;
      this.comboLeft = 1;
      this._beginAttack(0.32);
      return;
    }
    if (this.timer <= 0) {
      const [cMin, cMax] = this.cfg.combo;
      this.comboLeft = randInt(cMin, cMax) + (this.phaseCfg?.comboBonus ?? 0);
      this._beginAttack();
    }
  }

  _beginAttack(windupOverride) {
    const e = this.enemy;
    this.spark = (this.cfg.sparkAttackChance ?? 0) > Math.random();
    const base = this.cfg.windup * this.diff.enemySpeed;
    const windup = windupOverride ?? (this.spark ? base * 1.45 : base);
    // alternating hands for the micro:bit / boss, otherwise mostly right
    this.nextSide = (this.cfg.id === 'microbit' || this.cfg.boss) ? (this.nextSide === 'R' ? 'L' : 'R') : (Math.random() < 0.7 ? 'R' : 'L');
    e.setAction('windup', windup, { side: this.nextSide, spark: this.spark });
    this.emit('windup', { side: this.nextSide, spark: this.spark, duration: windup });
  }

  _onActionDone(name) {
    if (!this.active || !this.enemy.alive) return;
    const e = this.enemy;
    if (name === 'windup') {
      e.setAction('strike', this.cfg.strike, { side: this.nextSide, spark: this.spark, lunge: this.cfg.boss ? 0.8 : 1 });
    } else if (name === 'strike') {
      this.comboLeft--;
      if (this.comboLeft > 0) {
        this.spark = false;
        this.nextSide = this.nextSide === 'R' ? 'L' : 'R';
        e.setAction('windup', this.cfg.windup * 0.5 * this.diff.enemySpeed, { side: this.nextSide, spark: false });
        this.emit('windup', { side: this.nextSide, spark: false, duration: this.cfg.windup * 0.5 });
      } else {
        e.setAction('recover', 0.35);
        this.timer = this._interval();
      }
    } else if (name === 'hit' || name === 'dodge' || name === 'phase') {
      if (name === 'phase') e.invulnerable = false;
      if (this.timer < 0.5) this.timer = 0.5 + Math.random() * 0.4;
    }
  }

  /**
   * Called by combat when the player throws a punch, before impact.
   * Returns true if the enemy decided to dodge it.
   */
  considerDodge(hand) {
    if (!this.active || !this.enemy.alive) return false;
    const a = this.enemy.action;
    if (a !== 'idle' && a !== 'recover') return false;
    const chance = (this.cfg.dodgeChance ?? 0) * (this.cfg.boss ? 1 + this.enemy.phase * 0.5 : 1);
    if (Math.random() >= chance) return false;
    // dodge away from the incoming fist: player's left fist comes from screen-left
    const dir = hand === 'LEFT' ? -1 : 1; // enemy-local +X is the enemy's left = screen right
    this.enemy.setAction('dodge', 0.42, { dir: -dir });
    if (Math.random() < (this.cfg.counterChance ?? 0)) this.pendingCounter = true;
    this.emit('dodge', { hand });
    return true;
  }

  /** Called by combat after a successful hit. */
  onHit(hand) {
    const e = this.enemy;
    if (!e.alive) return;
    // boss phase transitions
    if (this.cfg.phases) {
      const frac = e.health / this.cfg.maxHealth;
      let p = 0;
      this.cfg.phases.forEach((ph, i) => { if (frac < ph.below && i > 0) p = i; });
      if (p > e.phase) {
        e.phase = p;
        this.comboLeft = 0;
        e.invulnerable = true;
        e.setAction('phase', 1.5);
        this.emit('phase', { phase: p, label: this.cfg.phases[p].label });
        this.timer = 1.0;
        return;
      }
    }
    const a = e.action;
    if (a === 'windup') {
      // a clean hit during the wind-up can interrupt the attack
      if (Math.random() < this.cfg.staggerOnHit * 1.8) {
        this.comboLeft = 0;
        e.setAction('hit', 0.3, { from: hand });
        this.emit('staggered');
        this.timer = Math.max(this.timer, 0.8);
      }
    } else if (a === 'strike') {
      // trade — enemy keeps punching
    } else if (Math.random() < 0.85) {
      e.setAction('hit', 0.26, { from: hand });
    }
  }
}
