// Central game configuration: balance, enemies, timings.
// Tweak numbers here rather than inside the systems.

export const GAME_TITLE = 'BATTLE OF THE BOARDS';
// Title shown at the very end, on the throne.
export const FINAL_TITLE = 'SHIR, KING OF INTERACTION';

export const PLAYER = {
  maxHealth: 100,
  eyeHeight: 1.65,
  walkSpeed: 4.6,            // metres / second
  healAfterWin: 0.6,         // fraction of missing health restored after a victory
  punchCooldownMs: 150,      // per hand — ignores events faster than this
  baseDamage: 5,
  minStrengthMult: 0.8,      // weak detected punch
  maxStrengthMult: 1.35,     // strong detected punch (clamped)
  strengthLow: 1100,         // mg that maps to minStrengthMult
  strengthHigh: 3200,        // mg that maps to maxStrengthMult (and above)
};

export const PUNCH_ANIM = {
  extendMs: 75,
  holdMs: 45,
  retractMs: 150,
  impactAt: 0.85,            // fraction of extension when the hit is resolved
};

// Distance along the route (metres) at which each battle happens.
// The camera stops `fightDistance` before the enemy.
export const ROUTE = {
  encounterAt: [34, 82, 130, 178, 232],
  throneAt: 300,
};

/**
 * Enemy definitions. `model` names a builder in enemies/models.js.
 * Times are in seconds.
 */
export const ENEMIES = [
  {
    id: 'resistor',
    name: 'The Angry Resistor',
    title: 'Battle 1 — 220 Ohms of Pure Rage',
    model: 'resistor',
    maxHealth: 70,
    attackDamage: 7,
    attackInterval: [2.6, 3.6],
    windup: 0.9,
    strike: 0.22,
    combo: [1, 1],
    dodgeChance: 0,
    counterChance: 0,
    staggerOnHit: 0.35,
    fightDistance: 1.75,
    scale: 1.0,
    hurtVoice: 1.6,
    zone: 0,
  },
  {
    id: 'arduino',
    name: 'Arduino Uno',
    title: 'Battle 2 — The Blue Brawler',
    model: 'arduino',
    maxHealth: 100,
    attackDamage: 8,
    attackInterval: [2.0, 2.9],
    windup: 0.7,
    strike: 0.2,
    combo: [1, 2],
    dodgeChance: 0.05,
    counterChance: 0,
    sparkAttackChance: 0.3,
    staggerOnHit: 0.3,
    fightDistance: 1.8,
    scale: 1.0,
    hurtVoice: 1.2,
    zone: 1,
  },
  {
    id: 'microbit',
    name: 'micro:bit V2',
    title: 'Battle 3 — 25 LEDs of Fury',
    model: 'microbit',
    maxHealth: 120,
    attackDamage: 7,
    attackInterval: [1.4, 2.2],
    windup: 0.5,
    strike: 0.16,
    combo: [2, 3],
    dodgeChance: 0.22,
    counterChance: 0.6,
    staggerOnHit: 0.22,
    fightDistance: 1.75,
    scale: 1.0,
    hurtVoice: 1.9,
    zone: 2,
  },
  {
    id: 'raspberry',
    name: 'Raspberry Pi',
    title: 'Battle 4 — The Heavy Processor',
    model: 'raspberry',
    maxHealth: 190,
    attackDamage: 13,
    attackInterval: [2.2, 3.0],
    windup: 0.85,
    strike: 0.24,
    combo: [1, 2],
    dodgeChance: 0.06,
    counterChance: 0.2,
    staggerOnHit: 0.18,
    fightDistance: 1.9,
    scale: 1.15,
    hurtVoice: 0.8,
    zone: 3,
  },
  {
    id: 'esp32',
    name: 'ESP32 Overlord',
    title: 'FINAL BATTLE — Dual-Core Destroyer',
    model: 'esp32',
    maxHealth: 280,
    attackDamage: 11,
    attackInterval: [1.6, 2.4],
    windup: 0.65,
    strike: 0.2,
    combo: [2, 3],
    dodgeChance: 0.1,
    counterChance: 0.4,
    sparkAttackChance: 0.35,
    staggerOnHit: 0.15,
    fightDistance: 2.25,
    scale: 1.25,
    hurtVoice: 0.6,
    zone: 4,
    boss: true,
    // Each phase starts when health drops below `below` (fraction).
    phases: [
      { below: 1.0, intervalMult: 1.0, comboBonus: 0, label: 'PHASE 1' },
      { below: 0.66, intervalMult: 0.8, comboBonus: 1, label: 'PHASE 2 — OVERCLOCKED' },
      { below: 0.33, intervalMult: 0.62, comboBonus: 2, label: 'PHASE 3 — DUAL CORE MELTDOWN' },
    ],
  },
];

export const ZONES = [
  { name: 'Resistor Fields', fog: 0x1b0f2e, sky: [0x2a0f4a, 0x0a0618], accent: 0xff7a1a, ground: '#1d4d2b', trace: '#e8b84a' },
  { name: 'Arduino Avenue', fog: 0x08203f, sky: [0x0b3f7a, 0x020a1c], accent: 0x22aaff, ground: '#0d3f7a', trace: '#bfe6ff' },
  { name: 'LED Matrix Plaza', fog: 0x1a0610, sky: [0x3a0b22, 0x07020a], accent: 0xff2a3a, ground: '#151515', trace: '#d9a640' },
  { name: 'Raspberry Factory', fog: 0x0b2412, sky: [0x14502a, 0x030c06], accent: 0xd11e5b, ground: '#1f6b34', trace: '#f0d27a' },
  { name: 'ESP32 Storm Tower', fog: 0x0a0a20, sky: [0x261066, 0x020212], accent: 0x3cf2ff, ground: '#14141c', trace: '#c9c9c9' },
  { name: 'Royal Hall of Interaction', fog: 0x2a1a05, sky: [0x5a3a0a, 0x120a02], accent: 0xffd36a, ground: '#3a2a10', trace: '#ffd36a' },
];
