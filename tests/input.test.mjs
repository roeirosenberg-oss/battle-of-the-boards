// Node unit tests for serial parsing + controller manager (no browser needed).
// Run: node tests/input.test.mjs
import { parseMessage } from '../src/input/messageParser.js';
import { ControllerManager } from '../src/input/controllerManager.js';
import { Emitter } from '../src/core/events.js';
import assert from 'node:assert/strict';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };

t('parses spec example lines', () => {
  const r = parseMessage('{"hand":"RIGHT","event":"PUNCH","strength":1600,"seq":12}');
  assert.deepEqual([r.hand, r.event, r.strength, r.seq], ['RIGHT', 'PUNCH', 1600, 12]);
  const l = parseMessage('{"hand":"LEFT","event":"PUNCH","strength":1350,"seq":19}\r');
  assert.equal(l.hand, 'LEFT');
});
t('rejects garbage and malformed punches', () => {
  assert.equal(parseMessage('hello'), null);
  assert.equal(parseMessage('{"hand":"UP","event":"PUNCH","seq":1}'), null);
  assert.equal(parseMessage('{"hand":"LEFT","event":"PUNCH"}'), null);
  assert.equal(parseMessage('{bad json'), null);
});
t('tolerates leading noise', () => {
  assert.equal(parseMessage('\x00\x1b{"event":"RECEIVER","status":"READY","group":73}').event, 'RECEIVER');
});

// fake serial
class FakeSerial extends Emitter { constructor() { super(); this.status = 'connected'; this.sent = []; } send(x) { this.sent.push(x); return true; } }
const sleep = (ms) => { const end = performance.now() + ms; while (performance.now() < end); };

t('left/right routing, duplicate filtering, cooldown', () => {
  const s = new FakeSerial(); const cm = new ControllerManager(s);
  const got = []; cm.on('punch', p => got.push(p.hand));
  s.emit('line', '{"hand":"LEFT","event":"PUNCH","strength":1500,"seq":1}');
  s.emit('line', '{"hand":"LEFT","event":"PUNCH","strength":1500,"seq":1}'); // radio duplicate
  s.emit('line', '{"hand":"RIGHT","event":"PUNCH","strength":1500,"seq":1}');
  assert.deepEqual(got, ['LEFT', 'RIGHT']);
  assert.equal(cm.hands.LEFT.duplicates, 1);
  s.emit('line', '{"hand":"LEFT","event":"PUNCH","strength":1500,"seq":2}'); // within cooldown
  assert.equal(got.length, 2); assert.equal(cm.hands.LEFT.ignoredCooldown, 1);
  sleep(160);
  s.emit('line', '{"hand":"LEFT","event":"PUNCH","strength":1500,"seq":5}'); // gap → 2 lost
  assert.deepEqual(got, ['LEFT', 'RIGHT', 'LEFT']);
  assert.equal(cm.hands.LEFT.dropped, 2);
});
t('hand status: offline → online, never online without data', () => {
  const s = new FakeSerial(); const cm = new ControllerManager(s);
  assert.equal(cm.handStatus('LEFT'), 'offline');
  cm.testPunch('LEFT');
  assert.equal(cm.handStatus('LEFT'), 'offline'); // test input never fakes hardware
  s.emit('line', '{"hand":"LEFT","event":"HEARTBEAT","threshold":1300,"seq":0,"rssi":-50}');
  assert.equal(cm.handStatus('LEFT'), 'online');
  s.status = 'disconnected';
  assert.equal(cm.handStatus('LEFT'), 'nousb');
});
t('sensitivity command format', () => {
  const s = new FakeSerial(); const cm = new ControllerManager(s);
  cm.setSensitivity('RIGHT', 10); cm.calibrate('LEFT');
  assert.deepEqual(s.sent, ['SENS R 700', 'CAL L']);
});
console.log(`\n${pass} tests passed`);
