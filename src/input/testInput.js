// Fallback testing controls: J = left punch, K = right punch, on-screen buttons,
// and an optional clearly-labelled simulation mode (auto punches).
// None of these ever change the hardware connection status.
import { settings } from '../core/settings.js';

export class TestInput {
  constructor(controllers) {
    this.controllers = controllers;
    this.simulation = false;
    this._simTimer = 0;
    this._held = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.target?.tagName === 'INPUT') return;
      if (!settings.get('testControls')) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || k === 'k') {
        if (this._held.has(k)) return;
        this._held.add(k);
        // Shift = strong test punch
        const strength = e.shiftKey ? 3200 : 1700;
        this.controllers.testPunch(k === 'j' ? 'LEFT' : 'RIGHT', strength, 'keyboard');
      }
    });
    window.addEventListener('keyup', (e) => this._held.delete(e.key.toLowerCase()));
  }

  bindButton(el, hand) {
    const fire = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.controllers.testPunch(hand, 1800, 'button');
    };
    el.addEventListener('pointerdown', fire);
  }

  setSimulation(on) { this.simulation = on; this._simTimer = 0.5; }

  /** Simulation mode: alternating punches with random rhythm — for testing without hardware. */
  update(dt, active) {
    if (!this.simulation || !active) return;
    this._simTimer -= dt;
    if (this._simTimer <= 0) {
      const hand = Math.random() < 0.5 ? 'LEFT' : 'RIGHT';
      const strength = 1200 + Math.random() * 2200;
      this.controllers.testPunch(hand, Math.round(strength), 'simulation');
      this._simTimer = 0.28 + Math.random() * 0.45;
    }
  }
}
