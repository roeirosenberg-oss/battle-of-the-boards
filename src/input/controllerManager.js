// Controller manager: merges real micro:bit events and fallback test input into
// one stream of punch events, removes duplicates, and tracks per-hand health.
import { Emitter } from '../core/events.js';
import { parseMessage } from './messageParser.js';
import { PLAYER } from '../config.js';
import { settings, sensitivityToThreshold } from '../core/settings.js';

const HEARTBEAT_TIMEOUT = 1.6;   // s without any packet → "signal lost"
const RECEIVER_TIMEOUT = 3.0;    // s without receiver heartbeat → "receiver silent"

function makeHandState(name) {
  return {
    name,
    everSeen: false,
    lastPacketAt: 0,
    lastSeq: null,
    seenSeqs: new Map(),   // seq → time (ms) for duplicate filtering
    rssi: null,
    threshold: null,
    noise: null,
    heartbeats: [],        // timestamps (ms) for link-quality estimate
    punches: 0,
    testPunches: 0,
    dropped: 0,            // punches inferred lost from sequence gaps
    duplicates: 0,
    ignoredCooldown: 0,
    lastPunch: null,       // {strength, seq, time, source}
    lastAccepted: -Infinity,
    motion: 0,
    calibratedAt: 0,
  };
}

export class ControllerManager extends Emitter {
  constructor(serial) {
    super();
    this.serial = serial;
    this.hands = { LEFT: makeHandState('LEFT'), RIGHT: makeHandState('RIGHT') };
    this.receiver = { lastAt: 0, uptime: null, group: null, pktL: 0, pktR: 0 };
    this.log = [];           // recent raw lines for the debug panel
    this.totalPunches = 0;
    this.invalidLines = 0;

    serial.on('line', (line) => this._onLine(line));
    serial.on('open', () => {
      // push the stored sensitivity to both hands once the link is up
      setTimeout(() => this.pushSensitivity(), 900);
    });
  }

  _pushLog(text, kind = 'in') {
    this.log.push({ t: performance.now(), text, kind });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
    this.emit('log', { text, kind });
  }

  _onLine(line) {
    const msg = parseMessage(line);
    if (!msg) {
      this.invalidLines++;
      this._pushLog(line, 'bad');
      return;
    }
    const now = performance.now();
    if (msg.event !== 'MOTION') this._pushLog(line, msg.event === 'PUNCH' ? 'punch' : 'in');

    switch (msg.event) {
      case 'RECEIVER':
      case 'PONG':
        this.receiver.lastAt = now;
        if (msg.uptime !== undefined) this.receiver.uptime = msg.uptime;
        if (msg.group !== undefined) this.receiver.group = msg.group;
        if (msg.pktL !== undefined) this.receiver.pktL = msg.pktL;
        if (msg.pktR !== undefined) this.receiver.pktR = msg.pktR;
        break;
      case 'HEARTBEAT': {
        const h = this.hands[msg.hand];
        this.receiver.lastAt = now;
        this._touch(h, msg, now);
        h.heartbeats.push(now);
        while (h.heartbeats.length && now - h.heartbeats[0] > 4000) h.heartbeats.shift();
        if (msg.threshold !== undefined) h.threshold = msg.threshold;
        // controller rebooted? (sequence went far backwards) → reset duplicate memory
        if (h.lastSeq !== null && msg.seq < h.lastSeq - 20 && h.lastSeq < 9900) {
          h.seenSeqs.clear(); h.lastSeq = msg.seq;
        }
        break;
      }
      case 'CALIBRATED': {
        const h = this.hands[msg.hand];
        this._touch(h, msg, now);
        h.threshold = msg.threshold; h.noise = msg.noise; h.calibratedAt = now;
        // Calibration measures gravity + hand tremor. Re-apply the player's chosen
        // sensitivity unless it would sit too close to the measured tremor.
        const level = settings.get(msg.hand === 'LEFT' ? 'sensitivityL' : 'sensitivityR');
        const userMg = sensitivityToThreshold(level);
        h.noiseLimited = userMg < msg.noise * 4;
        if (!h.noiseLimited) setTimeout(() => this.setSensitivity(msg.hand, level), 250);
        this.emit('calibrated', { hand: msg.hand, threshold: msg.threshold, noise: msg.noise, noiseLimited: h.noiseLimited });
        break;
      }
      case 'MOTION': {
        const h = this.hands[msg.hand];
        this._touch(h, msg, now);
        h.motion = msg.mag;
        this.emit('motion', { hand: msg.hand, mag: msg.mag });
        break;
      }
      case 'PUNCH': {
        const h = this.hands[msg.hand];
        this.receiver.lastAt = now;
        this._touch(h, msg, now);
        // duplicate filter: same seq seen in the last 5 s is the redundant copy
        const prevT = h.seenSeqs.get(msg.seq);
        if (prevT !== undefined && now - prevT < 5000) { h.duplicates++; break; }
        h.seenSeqs.set(msg.seq, now);
        if (h.seenSeqs.size > 64) {
          for (const [s, t] of h.seenSeqs) { if (now - t > 5000 || h.seenSeqs.size > 64) h.seenSeqs.delete(s); }
        }
        if (h.lastSeq !== null) {
          const gap = (msg.seq - h.lastSeq + 10000) % 10000;
          if (gap > 1 && gap < 50) h.dropped += gap - 1;
        }
        h.lastSeq = msg.seq;
        this._acceptPunch(msg.hand, msg.strength, 'microbit', msg.seq);
        break;
      }
      default:
        break;
    }
  }

  _touch(h, msg, now) {
    h.everSeen = true;
    h.lastPacketAt = now;
    if (msg.rssi !== undefined) h.rssi = msg.rssi;
  }

  _acceptPunch(hand, strength, source, seq = null) {
    const h = this.hands[hand];
    const now = performance.now();
    if (now - h.lastAccepted < PLAYER.punchCooldownMs) { h.ignoredCooldown++; return; }
    h.lastAccepted = now;
    if (source === 'microbit') h.punches++; else h.testPunches++;
    this.totalPunches++;
    h.lastPunch = { strength, seq, time: now, source };
    this.emit('punch', { hand, strength, source, seq, time: now });
  }

  /** Fallback test input (keyboard / buttons / simulation). Never marks hardware online. */
  testPunch(hand, strength = 1800, source = 'keyboard') {
    this._pushLog(`[${source}] ${hand} punch (test input, strength ${strength})`, 'test');
    this._acceptPunch(hand, strength, source);
  }

  handStatus(hand) {
    const h = this.hands[hand];
    if (this.serial.status !== 'connected') return 'nousb';
    if (!h.everSeen) return 'offline';
    return (performance.now() - h.lastPacketAt) / 1000 < HEARTBEAT_TIMEOUT ? 'online' : 'lost';
  }

  /** 0..100 based on heartbeats received in the last 4 s (controllers send 2.5 / s). */
  linkQuality(hand) {
    const h = this.hands[hand];
    const now = performance.now();
    const n = h.heartbeats.filter(t => now - t <= 4000).length;
    return Math.min(100, Math.round((n / 10) * 100));
  }

  receiverStatus() {
    if (this.serial.status !== 'connected') return this.serial.status;
    if (!this.receiver.lastAt) return 'silent';
    return (performance.now() - this.receiver.lastAt) / 1000 < RECEIVER_TIMEOUT ? 'alive' : 'silent';
  }

  /** Human-readable troubleshooting hint for the current state (or '' when all good). */
  troubleshoot() {
    const s = this.serial;
    if (s.status === 'unsupported') return s.message;
    if (s.status !== 'connected') return s.message;
    const since = (performance.now() - (s._connectedAt || 0)) / 1000;
    if (this.receiverStatus() === 'silent') {
      if (since < 3) return 'Connected — waiting for the receiver to report in…';
      if (s.bytesIn > 0 && this.invalidLines > 0 && !this.receiver.lastAt)
        return 'Data arrives but is not from the SHIR receiver firmware. Flash shir-receiver.hex onto the USB board.';
      return 'The port is open but the receiver is silent. Make sure shir-receiver.hex is flashed on the USB micro:bit, then unplug and replug it.';
    }
    const l = this.handStatus('LEFT'), r = this.handStatus('RIGHT');
    const tips = [];
    if (l === 'offline') tips.push('LEFT controller not heard yet — power it on (battery pack switched on, shows "L").');
    if (r === 'offline') tips.push('RIGHT controller not heard yet — power it on (battery pack switched on, shows "R").');
    if (l === 'lost') tips.push('LEFT controller signal lost — check batteries, move closer to the receiver.');
    if (r === 'lost') tips.push('RIGHT controller signal lost — check batteries, move closer to the receiver.');
    return tips.join(' ');
  }

  // ----- commands to the hardware -----
  setSensitivity(hand, level) {
    settings.set(hand === 'LEFT' ? 'sensitivityL' : 'sensitivityR', level);
    const mg = sensitivityToThreshold(level);
    this._pushLog(`> SENS ${hand[0]} ${mg}`, 'out');
    return this.serial.send(`SENS ${hand[0]} ${mg}`);
  }

  pushSensitivity() {
    this.setSensitivity('LEFT', settings.get('sensitivityL'));
    setTimeout(() => this.setSensitivity('RIGHT', settings.get('sensitivityR')), 120);
  }

  calibrate(hand = null) {
    const cmd = hand ? `CAL ${hand[0]}` : 'CAL';
    this._pushLog('> ' + cmd, 'out');
    return this.serial.send(cmd);
  }

  setLiveMotion(on) {
    this._pushLog(`> LIVE ${on ? 1 : 0}`, 'out');
    return this.serial.send(`LIVE ${on ? 1 : 0}`);
  }

  identify() {
    this._pushLog('> ID', 'out');
    return this.serial.send('ID');
  }
}
