// Guided calibration wizard: still-calibration on the boards, left/right
// mapping check, ordinary-movement false-trigger check, summary.
import { settings, sensitivityToThreshold } from '../core/settings.js';

const $ = (id) => document.getElementById(id);

export class CalibrationWizard {
  constructor({ serial, controllers, onStart }) {
    Object.assign(this, { serial, controllers, onStart });
    this.step = -1;
    this.active = false;
    $('calNext').addEventListener('click', () => this._next());
    $('calSkip').addEventListener('click', () => this._advance());
    $('calRestart').addEventListener('click', () => this.open());
    controllers.on('punch', (p) => this._onPunch(p));
    controllers.on('calibrated', (c) => this._onCalibrated(c));
  }

  open() {
    this.active = true;
    this.counts = { LEFT: 0, RIGHT: 0 };
    this.strengths = { LEFT: [], RIGHT: [] };
    this.falseTriggers = 0;
    this.calibratedHands = new Set();
    this._setStep(0);
  }

  close() { this.active = false; clearInterval(this._timer); clearTimeout(this._calTimeout); }

  _setStep(i) {
    this.step = i;
    clearInterval(this._timer);
    document.querySelectorAll('#calSteps li').forEach(li => {
      const s = Number(li.dataset.step);
      li.classList.toggle('on', s === i); li.classList.toggle('done', s < i);
    });
    $('calWarn').textContent = '';
    $('calCountL').textContent = this.counts.LEFT; $('calCountR').textContent = this.counts.RIGHT;
    const hw = this.serial.status === 'connected';
    const noHw = hw ? '' : ' (No receiver connected — you can walk through the steps with the J / K test keys, but real calibration needs the hardware.)';
    $('calSkip').style.display = i >= 4 ? 'none' : '';
    switch (i) {
      case 0:
        this._ui('Hold still', 'Stand in your boxing stance holding the L board in your LEFT hand and the R board in your RIGHT hand. Keep both completely still, then press Begin. The boards measure gravity and your natural hand tremor.' + noHw, 'Begin');
        break;
      case 1:
        this.counts.LEFT = 0; this.strengths.LEFT = [];
        this._ui('Punch with your LEFT hand', 'Throw 3 quick, snappy punches into the air with your LEFT hand only.', 'Waiting…');
        break;
      case 2:
        this.counts.RIGHT = 0; this.strengths.RIGHT = [];
        this._ui('Punch with your RIGHT hand', 'Now throw 3 quick punches with your RIGHT hand only.', 'Waiting…');
        break;
      case 3: {
        this.falseTriggers = 0;
        let left = 6;
        this._ui('Move normally — don\'t punch', `For ${left} seconds, move your arms slowly: adjust your stance, raise and lower your hands. No punches should be detected.`, 'Checking…');
        $('calNext').disabled = true;
        this._timer = setInterval(() => {
          left--;
          $('calText').textContent = `For ${left} more second${left === 1 ? '' : 's'}, move your arms slowly — no punching. Detected so far: ${this.falseTriggers}.`;
          if (left <= 0) {
            clearInterval(this._timer);
            $('calNext').disabled = false;
            if (this.falseTriggers > 0) {
              $('calWarn').innerHTML = `${this.falseTriggers} accidental punch${this.falseTriggers > 1 ? 'es' : ''} detected. <button class="btn small" id="calLower">Lower sensitivity by 1</button>`;
              $('calLower').onclick = () => {
                for (const h of ['LEFT', 'RIGHT']) {
                  const k = h === 'LEFT' ? 'sensitivityL' : 'sensitivityR';
                  this.controllers.setSensitivity(h, Math.max(1, settings.get(k) - 1));
                }
                $('calWarn').textContent = 'Sensitivity lowered. Repeat this step to check again.';
                $('calNext').textContent = 'Repeat check';
                this._repeat3 = true;
              };
            } else {
              $('calWarn').textContent = 'Great — ordinary movement did not trigger any punches.';
            }
            $('calNext').textContent = 'Continue';
          }
        }, 1000);
        break;
      }
      case 4: {
        const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
        const aL = avg(this.strengths.LEFT), aR = avg(this.strengths.RIGHT);
        const tips = [];
        for (const [h, a] of [['LEFT', aL], ['RIGHT', aR]]) {
          if (a == null) continue;
          const th = this.controllers.hands[h].threshold || sensitivityToThreshold(settings.get(h === 'LEFT' ? 'sensitivityL' : 'sensitivityR'));
          if (a < th * 1.25) tips.push(`${h} punches only just cross the threshold — consider raising ${h} sensitivity.`);
        }
        this._ui('Calibration complete!', `Average punch strength — LEFT: ${aL ?? '—'} mg, RIGHT: ${aR ?? '—'} mg. ${tips.join(' ') || 'Both hands look well tuned.'}`, 'Start Game');
        break;
      }
    }
  }

  _ui(title, text, nextLabel) {
    $('calTitle').textContent = title;
    $('calText').textContent = text;
    $('calNext').textContent = nextLabel;
    $('calNext').disabled = nextLabel === 'Waiting…';
  }

  _next() {
    if (this.step === 0) {
      if (this.serial.status === 'connected') {
        this.calibratedHands.clear();
        this.controllers.calibrate();
        $('calText').textContent = 'Calibrating… keep both boards still (about 1.5 seconds). The boards show a target, then a tick.';
        $('calNext').disabled = true;
        clearTimeout(this._calTimeout);
        this._calTimeout = setTimeout(() => {
          const missing = ['LEFT', 'RIGHT'].filter(h => !this.calibratedHands.has(h));
          if (missing.length) {
            $('calWarn').textContent = `No calibration reply from: ${missing.join(' and ')}. Check that the board is switched on and shows its letter. You can retry (Restart) or skip.`;
            $('calNext').disabled = false; $('calNext').textContent = 'Continue anyway';
            this._forceAdvance = true;
          }
        }, 6000);
        return;
      }
      this._advance();
      return;
    }
    if (this.step === 3 && this._repeat3) { this._repeat3 = false; this._setStep(3); return; }
    if (this.step === 4) { this.close(); this.onStart?.(); return; }
    this._advance();
  }

  _advance() {
    if (this._forceAdvance) this._forceAdvance = false;
    clearTimeout(this._calTimeout);
    if (this.step < 4) this._setStep(this.step + 1);
  }

  _onCalibrated({ hand, noise, threshold }) {
    if (!this.active || this.step !== 0) return;
    this.calibratedHands.add(hand);
    $('calWarn').textContent = `${[...this.calibratedHands].join(' + ')} calibrated (tremor ${noise} mg).`;
    if (this.calibratedHands.size === 2) setTimeout(() => this._advance(), 700);
  }

  _onPunch(p) {
    if (!this.active) return;
    const gl = $(p.hand === 'LEFT' ? 'calGloveL' : 'calGloveR');
    gl.classList.add('punch'); setTimeout(() => gl.classList.remove('punch'), 160);
    if (this.step === 1 || this.step === 2) {
      const want = this.step === 1 ? 'LEFT' : 'RIGHT';
      if (p.hand !== want) {
        $('calWarn').textContent = p.source === 'microbit'
          ? `That punch came from the ${p.hand} board! Make sure the board showing "${want[0]}" is in your ${want} hand (swap them if needed).`
          : `That was a ${p.hand} test punch — use ${want === 'LEFT' ? 'J' : 'K'} for ${want}.`;
        return;
      }
      this.counts[want]++;
      this.strengths[want].push(p.strength);
      $(want === 'LEFT' ? 'calCountL' : 'calCountR').textContent = this.counts[want];
      $(want === 'LEFT' ? 'calStrL' : 'calStrR').textContent = `last ${p.strength} mg`;
      if (this.counts[want] >= 3) {
        $('calWarn').textContent = `${want} hand confirmed ✔`;
        setTimeout(() => { if (this.step === (want === 'LEFT' ? 1 : 2)) this._advance(); }, 700);
      }
    } else if (this.step === 3) {
      this.falseTriggers++;
    }
  }
}
