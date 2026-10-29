// Menus, HUD, banners, popups, damage numbers, ending overlay and debug panel.
import * as THREE from 'three';
import { settings, sensitivityToThreshold } from '../core/settings.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ camera, audio }) {
    this.camera = camera;
    this.audio = audio;
    this.screenStack = [];
    this.handlers = {};
    this._bannerTimer = null;

    // generic data-action buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this.audio.unlock();
      this.audio.uiClick();
      this.handlers[btn.dataset.action]?.(btn);
    });
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest?.('.btn')) this.audio.uiHover();
    });
  }

  on(action, fn) { this.handlers[action] = fn; }

  // ---------------------------------------------------------------- screens
  show(id) {
    for (const el of document.querySelectorAll('.screen.show')) if (el.id !== id) el.classList.remove('show');
    if (id) $(id).classList.add('show');
    this.current = id;
  }
  hideAll() { this.show(null); }
  isOpen(id) { return $(id).classList.contains('show'); }

  setHudVisible(v) { $('hud').classList.toggle('hidden', !v); }

  // ---------------------------------------------------------------- HUD
  setFight(i, total, enemyName, zoneName) {
    $('fightNo').textContent = `FIGHT ${i + 1}/${total}`;
    $('enemyName').textContent = enemyName ? enemyName.toUpperCase() : '—';
    $('zoneName').textContent = zoneName || '';
  }

  setEnemyHealthVisible(v) { $('hpEnemyWrap').style.visibility = v ? 'visible' : 'hidden'; }

  setPlayerHealth(f) {
    const w = Math.max(0, Math.min(1, f)) * 100 + '%';
    $('hpPlayer').style.width = w; $('hpPlayerTrail').style.width = w;
    $('hpPlayer').classList.toggle('low', f < 0.3);
  }

  setEnemyHealth(f) {
    const w = Math.max(0, Math.min(1, f)) * 100 + '%';
    $('hpEnemy').style.width = w; $('hpEnemyTrail').style.width = w;
  }

  setCombo(n) {
    const el = $('combo');
    if (n >= 3) { el.textContent = `${n} HIT COMBO`; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    else el.textContent = '';
  }

  popup(text, kind = 'combo') {
    const el = document.createElement('div');
    el.className = 'popup ' + kind;
    el.textContent = text;
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 950);
    while ($('popups').children.length > 3) $('popups').firstChild.remove();
  }

  damageNumber(n, worldPos, big) {
    const p = worldPos.clone().project(this.camera);
    if (p.z > 1) return;
    const el = document.createElement('div');
    el.className = 'dmg' + (big ? ' big' : '');
    el.textContent = n;
    el.style.left = ((p.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 40) + 'px';
    el.style.top = ((-p.y * 0.5 + 0.5) * window.innerHeight - 30) + 'px';
    $('dmgLayer').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  banner(text, kind = 'info', seconds = 1.4) {
    const b = $('banner');
    clearTimeout(this._bannerTimer); clearTimeout(this._bannerTimer2);
    b.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'bn ' + kind;
    el.textContent = text;
    b.appendChild(el);
    this._bannerTimer = setTimeout(() => {
      el.classList.add('out');
      this._bannerTimer2 = setTimeout(() => { if (el.parentNode) el.remove(); }, 380);
    }, seconds * 1000);
  }

  clearBanner() { $('banner').innerHTML = ''; }

  showIntro(num, name, title) {
    $('introNum').textContent = num; $('introName').textContent = name; $('introTitle').textContent = title;
    const el = $('intro');
    el.classList.add('hidden'); void el.offsetWidth; el.classList.remove('hidden');
  }
  hideIntro() { $('intro').classList.add('hidden'); }

  playerHurt(dmg, spark) {
    const v = $('vignette');
    v.style.background = spark
      ? 'radial-gradient(ellipse at center, transparent 45%, rgba(60,220,255,0.75))'
      : 'radial-gradient(ellipse at center, transparent 50%, rgba(220,0,20,0.75))';
    v.style.opacity = Math.min(1, 0.5 + dmg / 25);
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => { v.style.transition = 'opacity 0.5s'; v.style.opacity = 0; setTimeout(() => v.style.transition = 'opacity 0.1s', 520); }, 90);
  }

  flash(duration = 0.6, peak = 1) {
    const f = $('flash');
    f.style.transition = 'none'; f.style.opacity = peak;
    void f.offsetWidth;
    f.style.transition = `opacity ${duration}s ease-out`;
    f.style.opacity = 0;
  }

  fadeToWhite(sec) {
    const f = $('flash');
    f.style.transition = `opacity ${sec}s ease-in`; f.style.opacity = 1;
  }

  letterbox(on) { $('letterbox').classList.toggle('on', on); }

  setControllerIndicators(l, r, usb, flashHand) {
    const cls = (s) => s === 'online' ? 'ok' : (s === 'lost' ? 'bad' : (s === 'offline' ? 'warn' : ''));
    $('ciL').className = 'ci ' + cls(l) + (flashHand === 'LEFT' ? ' hit' : '');
    $('ciR').className = 'ci ' + cls(r) + (flashHand === 'RIGHT' ? ' hit' : '');
    $('ciU').className = 'ci usb ' + (usb === 'alive' ? 'ok' : usb === 'connected' || usb === 'silent' ? 'warn' : '');
  }

  setTestButtonsVisible(v) { $('testButtons').classList.toggle('hidden', !v); }
  setSimBadge(v) { $('simBadge').classList.toggle('hidden', !v); }

  // ---------------------------------------------------------------- ending
  showFinalTitle(text) {
    const h = $('heTitle');
    h.innerHTML = '';
    // animate the title word by word
    text.split(' ').forEach((w, i, arr) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      s.style.animationDelay = (0.25 + i * 0.45) + 's';
      h.appendChild(s);
      if (i < arr.length - 1) h.appendChild(document.createTextNode(' '));
    });
    h.setAttribute('aria-label', text);
    $('ending').classList.remove('hidden');
    setTimeout(() => $('endingSub').classList.add('on'), 1800);
  }

  showEndingStats(html) { $('endingStats').innerHTML = html; $('endingStats').classList.add('on'); }
  showEndingButtons() { $('endingButtons').classList.remove('hidden'); }
  hideEnding() {
    $('ending').classList.add('hidden'); $('endingButtons').classList.add('hidden');
    $('endingSub').classList.remove('on'); $('endingStats').classList.remove('on');
    $('heTitle').innerHTML = '';
  }

  // ---------------------------------------------------------------- menu status chips
  setMenuStatus(items) {
    $('menuStatus').innerHTML = items.map(([cls, text]) => `<span class="chip"><span class="dot ${cls}"></span>${text}</span>`).join('');
  }
}

// --------------------------------------------------------------------------
// Hardware connection screen bindings
export class ConnectScreen {
  constructor({ serial, controllers, testInput, audio }) {
    Object.assign(this, { serial, controllers, testInput, audio });
    $('btnConnect').addEventListener('click', async () => { audio.unlock(); await serial.requestAndConnect(); this.refresh(); });
    $('btnShowAll').addEventListener('click', async () => { audio.unlock(); await serial.requestAndConnect({ showAll: true }); this.refresh(); });
    $('btnDisconnect').addEventListener('click', async () => { await serial.disconnect(); this.refresh(); });
    $('btnCalAll').addEventListener('click', () => this._cal(null));
    $('btnCalL').addEventListener('click', () => this._cal('LEFT'));
    $('btnCalR').addEventListener('click', () => this._cal('RIGHT'));
    $('btnIdentify').addEventListener('click', () => {
      if (!this._needUsb()) return;
      controllers.identify();
      $('cCalMsg').textContent = 'Both hand boards should now flash their letter (L / R) three times.';
    });
    $('chkLive').addEventListener('change', (e) => { controllers.setLiveMotion(e.target.checked); });
    $('chkSim').addEventListener('change', (e) => testInput.setSimulation(e.target.checked));
    for (const side of ['L', 'R']) {
      const el = $('sens' + side), out = $('sens' + side + 'Out');
      const key = side === 'L' ? 'sensitivityL' : 'sensitivityR';
      el.value = settings.get(key); out.textContent = el.value;
      el.addEventListener('input', () => { out.textContent = el.value; });
      el.addEventListener('change', () => {
        const hand = side === 'L' ? 'LEFT' : 'RIGHT';
        controllers.setSensitivity(hand, Number(el.value));
        $('cCalMsg').textContent = `${hand} threshold set to ${sensitivityToThreshold(Number(el.value))} mg` + (serial.status === 'connected' ? ' and sent to the controller.' : ' (saved — will be sent when connected).');
      });
    }
    for (const b of document.querySelectorAll('.testbtn')) testInput.bindButton(b, b.dataset.test);

    controllers.on('punch', (p) => this._flashHand(p.hand, p));
    controllers.on('motion', ({ hand, mag }) => {
      const th = controllers.hands[hand].threshold || sensitivityToThreshold(settings.get(hand === 'LEFT' ? 'sensitivityL' : 'sensitivityR'));
      const max = Math.max(th * 2, 1);
      $(hand === 'LEFT' ? 'cLMeter' : 'cRMeter').style.width = Math.min(100, mag / max * 100) + '%';
      $(hand === 'LEFT' ? 'cLTh' : 'cRTh').style.left = '50%';
    });
    controllers.on('calibrated', ({ hand, threshold, noise, noiseLimited }) => {
      $('cCalMsg').textContent = `${hand} calibrated: tremor ${noise} mg → ` + (noiseLimited ? `threshold raised to ${threshold} mg (your hand was shaky — hold steadier and retry for higher sensitivity).` : 'your sensitivity setting was re-applied.');
    });
    controllers.on('log', ({ text, kind }) => {
      const box = $('serialMini');
      if (!box.offsetParent) return; // only while visible
      const line = document.createElement('div'); line.className = kind; line.textContent = text;
      box.appendChild(line);
      while (box.children.length > 60) box.firstChild.remove();
      box.scrollTop = box.scrollHeight;
    });
  }

  _needUsb() {
    if (this.serial.status !== 'connected') { $('cCalMsg').textContent = 'Connect the USB receiver first.'; $('cCalMsg').style.color = 'var(--amber)'; return false; }
    $('cCalMsg').style.color = '';
    return true;
  }

  _cal(hand) {
    if (!this._needUsb()) return;
    this.controllers.calibrate(hand);
    $('cCalMsg').textContent = `Calibrating ${hand || 'both hands'}… hold ${hand ? 'the board' : 'both boards'} still in your boxing stance (≈1.5 s).`;
  }

  _flashHand(hand, p) {
    const card = $(hand === 'LEFT' ? 'liveL' : 'liveR');
    card.classList.add('flash'); card.querySelector('.glove-icon').classList.add('punch');
    clearTimeout(card._t);
    card._t = setTimeout(() => { card.classList.remove('flash'); card.querySelector('.glove-icon').classList.remove('punch'); }, 160);
    const src = p.source === 'microbit' ? 'micro:bit' : `test input (${p.source})`;
    $('cLast').textContent = `Last detected punch: ${hand} · strength ${p.strength} mg · ${src}` + (p.seq != null ? ` · seq ${p.seq}` : '');
  }

  refresh() {
    const s = this.serial, c = this.controllers;
    const usbDot = $('cUsbDot');
    const map = { connected: 'ok', connecting: 'wait', error: 'bad', unsupported: 'bad', disconnected: '' };
    usbDot.className = 'dot ' + (map[s.status] || '');
    $('cUsbText').textContent = { connected: 'USB connected', connecting: 'Connecting…', error: 'Connection error', unsupported: 'Web Serial not available', disconnected: 'Not connected' }[s.status];
    const rs = c.receiverStatus();
    $('cRxDot').className = 'dot ' + (rs === 'alive' ? 'ok' : (s.status === 'connected' ? 'warn' : ''));
    $('cRxText').textContent = 'Receiver firmware: ' + (rs === 'alive' ? `responding (radio group ${c.receiver.group ?? '?'})` : (s.status === 'connected' ? 'no response yet' : '—'));
    $('btnConnect').disabled = !s.supported || s.status === 'connecting';
    $('btnConnect').textContent = s.status === 'connected' ? 'Reconnect / choose another' : 'Connect micro:bit Receiver';
    const tr = c.troubleshoot();
    const tb = $('cTrouble');
    if (!tr && s.status === 'connected') { tb.textContent = 'All systems go — both controllers are talking to the receiver. Throw a punch to test!'; tb.className = 'trouble good'; }
    else { tb.textContent = tr; tb.className = 'trouble'; }

    for (const hand of ['LEFT', 'RIGHT']) {
      const k = hand === 'LEFT' ? 'L' : 'R';
      const st = c.handStatus(hand);
      const h = c.hands[hand];
      $('c' + k + 'Dot').className = 'dot ' + ({ online: 'ok', lost: 'bad', offline: 'warn' }[st] || '');
      $('c' + k + 'Text').textContent = { online: 'Connected', lost: 'Signal lost', offline: 'Not heard yet', nousb: 'Waiting for USB' }[st];
      const q = c.linkQuality(hand);
      $('c' + k + 'Info').innerHTML = st === 'nousb' ? 'Connect the receiver first' :
        `Link ${q}% · RSSI ${h.rssi ?? '—'} dBm<br>Threshold ${h.threshold ?? '—'} mg · Punches ${h.punches}` + (h.dropped ? ` · lost ${h.dropped}` : '');
    }
  }
}

// --------------------------------------------------------------------------
// Settings screen bindings
export function bindSettings() {
  const music = $('setMusic'), sfx = $('setSfx');
  const pct = v => Math.round(v * 100) + '%';
  music.value = settings.get('musicVolume'); $('setMusicOut').textContent = pct(music.value);
  sfx.value = settings.get('sfxVolume'); $('setSfxOut').textContent = pct(sfx.value);
  music.addEventListener('input', () => { settings.set('musicVolume', Number(music.value)); $('setMusicOut').textContent = pct(music.value); });
  sfx.addEventListener('input', () => { settings.set('sfxVolume', Number(sfx.value)); $('setSfxOut').textContent = pct(sfx.value); });
  const seg = (id, key) => {
    const root = $(id);
    const sync = () => root.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.get(key)));
    root.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { settings.set(key, b.dataset.v); sync(); } });
    sync();
  };
  seg('setDifficulty', 'difficulty');
  seg('setQuality', 'quality');
  const test = $('setTest'), dbg = $('setDebug');
  test.checked = settings.get('testControls'); dbg.checked = settings.get('showDebug');
  test.addEventListener('change', () => settings.set('testControls', test.checked));
  dbg.addEventListener('change', () => settings.set('showDebug', dbg.checked));
}

// --------------------------------------------------------------------------
// Debug panel
export class DebugPanel {
  constructor({ serial, controllers, getState, engine }) {
    Object.assign(this, { serial, controllers, getState, engine });
    this.el = $('debug');
    $('dbgClose').addEventListener('click', () => settings.set('showDebug', false));
    window.addEventListener('keydown', (e) => { if (e.key === 'F2') { e.preventDefault(); settings.set('showDebug', !settings.get('showDebug')); } });
    settings.onChange((k, v) => { if (k === 'showDebug') { this.el.classList.toggle('hidden', !v); $('setDebug').checked = v; } });
    this.el.classList.toggle('hidden', !settings.get('showDebug'));
    controllers.on('log', ({ text, kind }) => {
      if (this.el.classList.contains('hidden')) return;
      const log = $('dbgLog');
      const line = document.createElement('div'); line.className = kind;
      line.textContent = `${(performance.now() / 1000).toFixed(2)}  ${text}`;
      log.appendChild(line);
      while (log.children.length > 80) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
    });
    this._acc = 0;
  }

  update(dt) {
    if (this.el.classList.contains('hidden')) return;
    this._acc += dt; if (this._acc < 0.2) return; this._acc = 0;
    const c = this.controllers, s = this.serial;
    const L = c.hands.LEFT, R = c.hands.RIGHT;
    const lp = (h) => h.lastPunch ? `${h.lastPunch.strength} mg (${h.lastPunch.source}${h.lastPunch.seq != null ? ' #' + h.lastPunch.seq : ''}) ${((performance.now() - h.lastPunch.time) / 1000).toFixed(1)}s ago` : '—';
    const st = this.getState();
    const rows = [
      ['Receiver USB', s.status],
      ['Receiver fw', c.receiverStatus() + (c.receiver.uptime != null ? ` · up ${(c.receiver.uptime / 1000).toFixed(0)}s` : '')],
      ['Serial in', `${s.linesIn} lines · ${s.bytesIn} B · bad ${c.invalidLines}`],
      ['LEFT', `${c.handStatus('LEFT')} · link ${c.linkQuality('LEFT')}% · rssi ${L.rssi ?? '—'}`],
      ['RIGHT', `${c.handStatus('RIGHT')} · link ${c.linkQuality('RIGHT')}% · rssi ${R.rssi ?? '—'}`],
      ['Last LEFT', lp(L)],
      ['Last RIGHT', lp(R)],
      ['Punches', `L ${L.punches}+${L.testPunches}t · R ${R.punches}+${R.testPunches}t · total ${c.totalPunches}`],
      ['Filtered', `dup L${L.duplicates}/R${R.duplicates} · cooldown L${L.ignoredCooldown}/R${R.ignoredCooldown} · lost L${L.dropped}/R${R.dropped}`],
      ['Radio pkts', `L ${c.receiver.pktL} · R ${c.receiver.pktR}`],
      ['Thresholds', `L ${L.threshold ?? '—'} · R ${R.threshold ?? '—'} mg`],
      ['Game', `${st.state} · fight ${st.fight + 1}/5 · d=${st.routeD.toFixed(1)}`],
      ['Health', `Shir ${st.playerHealth} · enemy ${st.enemyHealth ?? '—'}`],
      ['FPS', this.engine.fps.toFixed(0)],
    ];
    $('dbgGrid').innerHTML = rows.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('');
  }
}
