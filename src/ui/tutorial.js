// Short "learn to punch" tutorial shown at the start of a new game.
// Step 1: an animated glove demonstrates a RIGHT punch → the player punches
// with the right hand → Shir's right glove punches → check mark.
// Step 2: the same for the LEFT hand. Then "Ready" and the journey begins.
const $ = (id) => document.getElementById(id);

const STEPS = [
  { hand: 'RIGHT', title: 'Punch with your right hand', sub: 'One quick jab into the air' },
  { hand: 'LEFT', title: 'Now your left hand', sub: 'Same move, other fist' },
];

export class Tutorial {
  constructor({ audio, onDone }) {
    this.audio = audio;
    this.onDone = onDone;
    this.active = false;
    this.el = $('tutorial');
    $('tutSkip').addEventListener('click', () => this.finish(true));
  }

  start() {
    this.active = true;
    this.step = 0;
    this.locked = false;
    this.el.classList.remove('hidden', 'out');
    this._show(0);
  }

  _show(i) {
    const s = STEPS[i];
    this.el.dataset.hand = s.hand;
    this.el.classList.remove('done', 'nope');
    $('tutStep').textContent = `${i + 1} / ${STEPS.length}`;
    $('tutTitle').textContent = s.title;
    $('tutSub').textContent = s.sub;
    // restart the demo animation
    const demo = $('tutDemo');
    demo.classList.remove('play'); void demo.offsetWidth; demo.classList.add('play');
    this.locked = false;
  }

  /** Called for every accepted punch while the tutorial is open. Returns true if it was the expected hand. */
  onPunch(hand) {
    if (!this.active || this.locked) return false;
    const want = STEPS[this.step].hand;
    if (hand !== want) {
      this.el.classList.remove('nope'); void this.el.offsetWidth; this.el.classList.add('nope');
      $('tutSub').textContent = want === 'RIGHT' ? 'That was your left — try the right hand' : 'That was your right — try the left hand';
      return false;
    }
    this.locked = true;
    this.el.classList.add('done');
    $('tutTitle').textContent = this.step === STEPS.length - 1 ? 'You got it' : 'Nice punch';
    $('tutSub').textContent = this.step === STEPS.length - 1 ? 'Ready to fight' : '';
    this.audio.countdownBeep(this.step === STEPS.length - 1);
    setTimeout(() => {
      if (!this.active) return;
      this.step++;
      if (this.step < STEPS.length) this._show(this.step);
      else this.finish(false);
    }, this.step === STEPS.length - 1 ? 1300 : 1000);
    return true;
  }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('out');
    setTimeout(() => this.el.classList.add('hidden'), 450);
    this.onDone?.(skipped);
  }

  hide() {
    this.active = false;
    this.el.classList.add('hidden');
  }
}
