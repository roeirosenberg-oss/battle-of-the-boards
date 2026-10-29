// BATTLE OF THE BOARDS — game bootstrap and state machine.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { settings } from './core/settings.js';
import { ENEMIES, ROUTE, ZONES, PLAYER } from './config.js';
import { World } from './world/world.js';
import { CameraRig } from './player/cameraRig.js';
import { Hands } from './player/hands.js';
import { Enemy } from './enemies/enemy.js';
import { EnemyAI } from './enemies/enemyAI.js';
import { Combat } from './combat/combat.js';
import { SparkSystem, Confetti } from './fx/particles.js';
import { ArcPool } from './fx/lightning.js';
import { AudioSystem } from './audio/audio.js';
import { SerialConnection } from './input/serialConnection.js';
import { ControllerManager } from './input/controllerManager.js';
import { TestInput } from './input/testInput.js';
import { CalibrationWizard } from './input/calibration.js';
import { UI, ConnectScreen, DebugPanel, bindSettings } from './ui/ui.js';
import { VictorySequence } from './ending/victorySequence.js';
import { DIFFICULTY } from './core/settings.js';

const params = new URLSearchParams(location.search);
const DEV = {
  fast: Number(params.get('fast') || 1),          // walking speed multiplier (testing)
  skipTo: params.has('skipto') ? Number(params.get('skipto')) : null,
  ending: params.has('ending'),
  sim: params.has('sim'),
  autostart: params.has('autostart'),
};
if (params.get('quality')) settings.set('quality', params.get('quality'));

// ------------------------------------------------------------------ systems
const engine = new Engine(document.getElementById('game'));
const audio = new AudioSystem();
const serial = new SerialConnection();
const controllers = new ControllerManager(serial);
const testInput = new TestInput(controllers);
const ui = new UI({ camera: engine.camera, audio });
const world = new World(engine.scene);
const cameraRig = new CameraRig(engine.camera);
const hands = new Hands(engine.camera);
const sparks = new SparkSystem(engine.scene);
const confetti = new Confetti(engine.scene);
const arcs = new ArcPool(engine.scene, 18, { color: 0xa8f7ff, jitter: 0.2 });
const combat = new Combat({ engine, hands, cameraRig, audio, ui, sparks, arcs });
const ending = new VictorySequence({ scene: engine.scene, world, cameraRig, hands, audio, ui, sparks, confetti, arcs });
const connectScreen = new ConnectScreen({ serial, controllers, testInput, audio });
bindSettings();

// ------------------------------------------------------------------ game state
const game = {
  state: 'menu',      // menu | walking | intro | fighting | victory | defeat | ending | endingDone
  paused: false,
  fight: 0,
  routeD: 0,
  walkRamp: 0,
  enemies: [],
  enemy: null,
  ai: null,
  stateT: 0,
  flags: {},
  retries: 0,
  totalStats: { hits: 0, misses: 0, maxCombo: 0 },
  returnScreen: 'menu',
};
window.__shir = { game, engine, controllers, combat, serial, world, settings, cameraRig, hands, ending, THREE }; // for debugging in the console

const debug = new DebugPanel({
  serial, controllers, engine,
  getState: () => ({ state: game.paused ? game.state + ' (paused)' : game.state, fight: game.fight, routeD: game.routeD, playerHealth: combat.playerHealth, enemyHealth: game.enemy?.health }),
});

const wizard = new CalibrationWizard({ serial, controllers, onStart: () => startGame() });

const GAMEPLAY = ['walking', 'intro', 'fighting', 'victory'];

// ------------------------------------------------------------------ helpers
function eyeAt(d) {
  const f = world.frame(d);
  return f.pos.clone().setY(PLAYER.eyeHeight);
}

function spawnEnemy(i) {
  const cfg = ENEMIES[i];
  const e = new Enemy(cfg);
  const d = ROUTE.encounterAt[i];
  const f = world.frame(d);
  e.root.position.copy(f.pos);
  e.root.position.y = 0.18; // standing on the arena platform
  e.faceTowards(world.frame(d - 10).pos);
  engine.scene.add(e.root);
  e.setAction('idle');
  return e;
}

function clearEnemies() {
  for (const e of game.enemies) e?.dispose();
  game.enemies = [];
  game.enemy = null;
  game.ai = null;
}

function setState(s) {
  game.state = s;
  game.stateT = 0;
  game.flags = {};
}

// ------------------------------------------------------------------ flow
function startGame(fromFight = 0) {
  audio.unlock();
  ending.stop();
  combat.stop();
  clearEnemies();
  ui.hideEnding();
  ui.hideAll();
  ui.hideIntro();
  ui.clearBanner();
  // only the upcoming opponent exists in the scene (keeps draw calls low); the next one
  // is spawned when Shir starts walking toward it
  for (let i = 0; i < ENEMIES.length; i++) game.enemies.push(i === fromFight ? spawnEnemy(i) : null);
  game.fight = fromFight;
  game.routeD = fromFight > 0 ? ROUTE.encounterAt[fromFight - 1] + 2 : 0;
  game.walkRamp = 0;
  game.retries = 0;
  game.totalStats = { hits: 0, misses: 0, maxCombo: 0 };
  game.paused = false;
  combat.resetPlayerHealth(true);
  combat.stats = { hits: 0, misses: 0, damageDealt: 0, damageTaken: 0, maxCombo: 0 };
  cameraRig.cinematic = null;
  cameraRig.setTargets(eyeAt(game.routeD), eyeAt(game.routeD + 10), true);
  hands.setVisible(true);
  hands.setMode('walk');
  ui.setHudVisible(true);
  ui.setEnemyHealthVisible(false);
  ui.setTestButtonsVisible(settings.get('testControls'));
  ui.setSimBadge(testInput.simulation);
  ui.setFight(game.fight, ENEMIES.length, ENEMIES[game.fight].name, ZONES[world.zoneAt(game.routeD)].name);
  audio.playMusic('explore');
  setState('walking');
  ui.banner(fromFight === 0 ? 'THE JOURNEY BEGINS' : `FIGHT ${fromFight + 1}`, 'info', 1.8);
}

function toMenu() {
  ending.stop();
  combat.stop();
  clearEnemies();
  ui.hideEnding();
  ui.hideIntro();
  ui.clearBanner();
  ui.setHudVisible(false);
  ui.letterbox(false);
  hands.setVisible(false);
  game.paused = false;
  cameraRig.cinematic = null;
  setState('menu');
  ui.show('menu');
  audio.playMusic('menu');
}

function beginIntro() {
  const i = game.fight;
  const e = game.enemies[i] || (game.enemies[i] = spawnEnemy(i));
  game.enemy = e;
  game.ai = new EnemyAI(e, DIFFICULTY[settings.get('difficulty')] || DIFFICULTY.normal);
  const cfg = ENEMIES[i];
  setState('intro');
  cameraRig.walking = false;
  hands.setMode('guard');
  world.setArenaActive(i, true);
  e.setAction('intro', 1.7);
  ui.showIntro(cfg.boss ? 'FINAL BATTLE' : `BATTLE ${i + 1} / ${ENEMIES.length}`, cfg.name, cfg.title);
  ui.setFight(i, ENEMIES.length, cfg.name, ZONES[i].name);
  ui.setEnemyHealthVisible(true);
  ui.setEnemyHealth(1);
  ui.letterbox(true);
  audio.playMusic(cfg.boss ? 'boss' : 'fight');
  audio.bell();
  if (cfg.id === 'raspberry' || cfg.boss) ui.flash(0.5, 0.35);
}

function introUpdate(dt) {
  const i = game.fight, e = game.enemy, cfg = e.config;
  const t = game.stateT;
  // dramatic extras for the heavy hitters
  if (cfg.id === 'raspberry' && t > 0.6 && !game.flags.slam) {
    game.flags.slam = true;
    cameraRig.shake(0.7); audio.hit(1); audio.ko(false);
    sparks.burst(e.root.position.clone().add(new THREE.Vector3(0, 0.1, 0)), { count: 120, colors: [0xffffff, 0xc51a4a, 0xf0d27a], speed: 6, life: 0.8, size: 0.2, gravity: -6 });
  }
  if (cfg.boss && t > 0.3 && Math.random() < dt * 12) {
    const c = e.root.position.clone().add(new THREE.Vector3(0, e.lookHeight, 0));
    arcs.fire(c, c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7)), 0.25);
    if (Math.random() < 0.3) audio.spark(0.5);
  }
  if (t > 1.7 && !game.flags.step) {
    game.flags.step = true;
    // the enemy steps forward into fighting range
    const f = world.frame(game.routeD);
    const target = f.pos.clone().addScaledVector(f.tangent, cfg.fightDistance);
    e.walkTo(target, cfg.id === 'microbit' ? 2.2 : 1.5, () => { game.flags.arrived = true; }, cameraRig.eye.clone().setY(0));
  }
  if ((game.flags.arrived || t > 5) && !game.flags.fight) {
    game.flags.fight = true;
    if (e.walkTarget) { e.root.position.copy(e.walkTarget); e.walkTarget = null; e.setAction('idle'); }
    ui.hideIntro();
    ui.letterbox(false);
    ui.banner('FIGHT!', 'fight', 1.0);
    audio.bell();
    cameraRig.shake(0.25);
    setState('fighting');
    combat.startFight(e, game.ai);
  }
}

combat.on('victory', ({ stats }) => {
  setState('victory');
  const i = game.fight;
  hands.setMode('cheer');
  ui.setCombo(0);
  audio.fanfare();
  world.setArenaActive(i, false);
  combat.healAfterVictory();
  game.totalStats.maxCombo = Math.max(game.totalStats.maxCombo, stats.maxCombo);
  const last = i === ENEMIES.length - 1;
  ui.banner(last ? 'ALL FIVE DEFEATED!' : 'VICTORY!', 'victory', 2.0);
  ui.popup(`${i + 1} / ${ENEMIES.length} CLEARED · health restored`, 'combo');
});

combat.on('defeat', () => {
  setState('defeat');
  hands.setMode('guard');
  game.retries++;
  ui.show('defeat');
  document.getElementById('defeatText').textContent = `${ENEMIES[game.fight].name} got the better of you this time. Shake it off and try again — watch for the wind-up!`;
});

function retryFight() {
  ui.hideAll();
  combat.stop();
  const i = game.fight;
  game.enemies[i]?.dispose();
  game.enemies[i] = spawnEnemy(i);
  combat.resetPlayerHealth(true);
  game.paused = false;
  beginIntro();
}

function victoryUpdate(dt) {
  const t = game.stateT, e = game.enemy;
  // the defeated enemy powers down and dissolves in a burst of sparks
  if (t > 1.4 && !game.flags.dissolve && e) {
    game.flags.dissolve = true;
    sparks.burst(e.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 90, colors: [0x7ff9ff, 0xffffff, 0xffd36a], speed: 3, life: 1.0, size: 0.16, gravity: 1 });
    audio.spark(0.8);
  }
  if (game.flags.dissolve && e) {
    const k = Math.max(0, 1 - (t - 1.4) / 0.6);
    e.root.scale.setScalar(e.config.scale * k);
    if (k <= 0 && !game.flags.gone) { game.flags.gone = true; e.root.visible = false; }
  }
  if (t > 3.0) {
    if (e) { e.dispose(); game.enemies[game.fight] = null; }
    game.enemy = null; game.ai = null;
    combat.stop();
    game.fight++;
    hands.setMode('walk');
    ui.setEnemyHealthVisible(false);
    if (game.fight < ENEMIES.length) {
      ui.setFight(game.fight, ENEMIES.length, ENEMIES[game.fight].name, ZONES[world.zoneAt(game.routeD)].name);
      audio.playMusic('explore');
    } else {
      document.getElementById('fightNo').textContent = 'TO THE THRONE';
      document.getElementById('enemyName').textContent = '';
      audio.playMusic('throne');
    }
    game.walkRamp = 0;
    setState('walking');
  }
}

function walkingUpdate(dt) {
  const toThrone = game.fight >= ENEMIES.length;
  const stopAt = toThrone ? ROUTE.throneAt - 9 : ROUTE.encounterAt[game.fight] - 4;
  game.walkRamp = Math.min(1, game.walkRamp + dt * 0.8);
  const remaining = stopAt - game.routeD;
  const slow = Math.min(1, Math.max(0.25, remaining / 4)); // ease into the stop
  const speed = PLAYER.walkSpeed * DEV.fast * game.walkRamp * slow;
  game.routeD = Math.min(stopAt, game.routeD + speed * dt);
  cameraRig.walking = true;
  cameraRig.walkSpeed = speed / DEV.fast;
  const eye = eyeAt(game.routeD);
  let look = eyeAt(game.routeD + 10).add(new THREE.Vector3(0, -0.15, 0));
  if (!toThrone && !game.enemies[game.fight]) game.enemies[game.fight] = spawnEnemy(game.fight);
  const e = game.enemies[game.fight];
  if (e) {
    const head = e.root.position.clone().setY(e.lookHeight * 0.9);
    const dist = eye.distanceTo(e.root.position.clone().setY(eye.y));
    const k = THREE.MathUtils.clamp(1 - (dist - 4) / 16, 0, 1);
    look.lerp(head, k * k);
    if (dist < 14 && !game.flags.taunt) { game.flags.taunt = true; e.setAction('taunt', 1.4); audio.enemyWindup(); }
  }
  cameraRig.lookStiffness = 4;
  cameraRig.setTargets(eye, look);
  // zone label
  const z = world.zoneAt(game.routeD);
  if (z !== game.flags.zone) {
    game.flags.zone = z;
    document.getElementById('zoneName').textContent = ZONES[z].name;
    if (game.stateT > 0.5) ui.banner(ZONES[z].name.toUpperCase(), 'info', 1.6);
  }
  if (game.routeD >= stopAt - 0.001) {
    cameraRig.walking = false;
    if (toThrone) {
      setState('ending');
      game.totalStats.hits = combat.stats.hits;
      ending.start({ hits: combat.stats.hits, maxCombo: game.totalStats.maxCombo, retries: game.retries }, () => setState('endingDone'));
    } else beginIntro();
  }
}

function fightCameraUpdate() {
  const e = game.enemy;
  if (!e) return;
  const eye = eyeAt(game.routeD);
  const target = e.root.position.clone().add(new THREE.Vector3(e.rig.offset.x * 0.3, 0, 0));
  target.y = Math.max(PLAYER.eyeHeight * 0.75, e.lookHeight * 0.88);
  cameraRig.lookStiffness = 7;
  cameraRig.setTargets(eye, target);
}

// ------------------------------------------------------------------ input
controllers.on('punch', (p) => {
  if (game.paused || !GAMEPLAY.includes(game.state)) return;
  combat.onPunchInput(p.hand, p.strength, true);
});

const canvasEl = engine.renderer.domElement;
canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
canvasEl.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (!settings.get('testControls') || game.paused || !GAMEPLAY.includes(game.state)) return;
  if (e.button === 0) controllers.testPunch('LEFT', 1800, 'mouse');
  else if (e.button === 2) controllers.testPunch('RIGHT', 1800, 'mouse');
});
for (const b of document.querySelectorAll('#testButtons .tbtn')) testInput.bindButton(b, b.dataset.test);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (GAMEPLAY.includes(game.state) || game.state === 'defeat') {
      if (game.state === 'defeat') return;
      if (game.paused && ui.isOpen('pause')) resume();
      else if (!game.paused) pause();
    }
  }
});

function pause() { game.paused = true; game.returnScreen = 'pause'; ui.show('pause'); }
function resume() { game.paused = false; game.returnScreen = 'menu'; ui.hideAll(); }

cameraRig.on('footstep', ({ side }) => audio.footstep(side));

settings.onChange((k, v) => {
  if (k === 'testControls') ui.setTestButtonsVisible(v && GAMEPLAY.includes(game.state));
});

// ------------------------------------------------------------------ menu actions
ui.on('start', () => startGame(0));
ui.on('connect', () => { audio.unlock(); ui.show('connect'); connectScreen.refresh(); });
ui.on('calibrate', () => { audio.unlock(); ui.show('calibrate'); wizard.open(); });
ui.on('settings', () => ui.show('settings'));
ui.on('howto', () => ui.show('howto'));
ui.on('back', () => { wizard.close(); ui.show(game.paused ? 'pause' : 'menu'); });
ui.on('resume', () => resume());
ui.on('menu', () => toMenu());
ui.on('retry', () => retryFight());
ui.on('playagain', () => startGame(0));

document.getElementById('chkSim').checked = DEV.sim;
if (DEV.sim) testInput.setSimulation(true);
document.getElementById('chkSim').addEventListener('change', (e) => ui.setSimBadge(e.target.checked && GAMEPLAY.includes(game.state)));

// ------------------------------------------------------------------ main loop
let menuT = 0, uiAcc = 0, lastFlashHand = null, flashT = 0;
controllers.on('punch', (p) => { lastFlashHand = p.hand; flashT = 0.15; });

engine.addUpdater((dt, rawDt) => {
  const active = !game.paused;
  if (active) game.stateT += dt;

  switch (game.state) {
    case 'menu': {
      menuT += rawDt;
      const d = 14 + Math.sin(menuT * 0.05) * 6;
      const f = world.frame(d);
      const eye = f.pos.clone().addScaledVector(f.side, Math.sin(menuT * 0.1) * 3).setY(2.4 + Math.sin(menuT * 0.2) * 0.4);
      cameraRig.walking = false;
      cameraRig.lookStiffness = 2;
      cameraRig.setTargets(eye, world.frame(d + 22).pos.setY(1.6));
      break;
    }
    case 'walking': if (active) walkingUpdate(dt); break;
    case 'intro': if (active) { introUpdate(dt); fightCameraUpdate(); } break;
    case 'fighting': if (active) { combat.update(dt); game.ai?.update(dt); fightCameraUpdate(); } break;
    case 'victory': if (active) { combat.update(dt); victoryUpdate(dt); fightCameraUpdate(); } break;
    case 'defeat': if (active) { combat.update(dt); fightCameraUpdate(); } break;
    case 'ending':
    case 'endingDone': ending.update(dt); break;
  }

  if (active || game.state === 'menu') {
    for (const e of game.enemies) if (e) e.update(dt, cameraRig.eye.clone().setY(0));
    testInput.update(dt, game.state === 'fighting' && !game.paused);
  }
  hands.update(active ? dt : 0, cameraRig.stepPhase);
  cameraRig.update(dt);
  world.update(dt, engine.camera.position, game.state === 'menu' ? 10 : (game.state.startsWith('ending') ? ROUTE.throneAt : game.routeD));
  sparks.update(dt);
  arcs.update(dt);
  confetti.update(dt, performance.now() / 1000);
  debug.update(rawDt);

  // throttled UI refresh
  uiAcc += rawDt; flashT -= rawDt;
  if (uiAcc > 0.2) {
    uiAcc = 0;
    ui.setControllerIndicators(controllers.handStatus('LEFT'), controllers.handStatus('RIGHT'), controllers.receiverStatus(), flashT > 0 ? lastFlashHand : null);
    if (ui.isOpen('connect')) connectScreen.refresh();
    if (game.state === 'menu') {
      const rs = controllers.receiverStatus();
      ui.setMenuStatus([
        [rs === 'alive' ? 'ok' : (serial.status === 'connected' ? 'warn' : ''), rs === 'alive' ? 'Receiver connected' : (serial.status === 'connected' ? 'Receiver silent' : 'Receiver not connected')],
        [{ online: 'ok', lost: 'bad', offline: 'warn' }[controllers.handStatus('LEFT')] || '', 'Left hand'],
        [{ online: 'ok', lost: 'bad', offline: 'warn' }[controllers.handStatus('RIGHT')] || '', 'Right hand'],
        ...(testInput.simulation ? [['warn', 'Simulation mode ON']] : []),
      ]);
    }
    ui.setSimBadge(testInput.simulation && GAMEPLAY.includes(game.state));
  }
});

// ------------------------------------------------------------------ boot
hands.setVisible(false);
engine.start();
serial.tryAutoConnect();
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.getElementById('loading').classList.remove('show');
  if (DEV.ending) { startGame(0); game.fight = ENEMIES.length; clearEnemies(); game.enemies = [null, null, null, null, null]; game.routeD = ROUTE.throneAt - 30; }
  else if (DEV.skipTo !== null) startGame(Math.max(0, Math.min(4, DEV.skipTo)));
  else if (DEV.autostart) startGame(0);
  else { ui.show('menu'); }
}));
// Browsers start audio only after a user gesture.
window.addEventListener('pointerdown', () => { audio.unlock(); if (game.state === 'menu') audio.playMusic('menu'); }, { once: true });
