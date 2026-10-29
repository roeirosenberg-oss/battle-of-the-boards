// Persistent user settings (localStorage, with safe fallbacks).
const KEY = 'shir-king-settings-v1';

const DEFAULTS = {
  musicVolume: 0.55,
  sfxVolume: 0.85,
  sensitivityL: 6,      // 1 (least sensitive) .. 10 (most sensitive)
  sensitivityR: 6,
  quality: 'high',      // 'high' | 'low'
  showDebug: false,
  testControls: true,   // J/K keyboard + on-screen buttons
  difficulty: 'normal', // 'easy' | 'normal' | 'hard'
};

let current = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) current = { ...DEFAULTS, ...JSON.parse(raw) };
} catch { /* storage unavailable — keep defaults */ }

const listeners = new Set();

export const settings = {
  get(k) { return current[k]; },
  set(k, v) {
    current[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
    for (const fn of listeners) fn(k, v);
  },
  all() { return { ...current }; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/** Sensitivity 1..10 → accelerometer threshold in milli-g (10 = most sensitive). */
export function sensitivityToThreshold(level) {
  const l = Math.max(1, Math.min(10, Math.round(level)));
  // 1 → 2600 mg, 10 → 700 mg (linear)
  return Math.round(2600 - (l - 1) * (1900 / 9));
}

export function thresholdToSensitivity(mg) {
  return Math.max(1, Math.min(10, Math.round(1 + (2600 - mg) / (1900 / 9))));
}

export const DIFFICULTY = {
  easy: { enemyDamage: 0.6, enemySpeed: 1.25, playerDamage: 1.25 },
  normal: { enemyDamage: 1, enemySpeed: 1, playerDamage: 1 },
  hard: { enemyDamage: 1.35, enemySpeed: 0.85, playerDamage: 0.9 },
};
