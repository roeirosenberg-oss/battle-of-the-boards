// Expressive faces for the electronic enemies.
// CartoonFace: 3D eyes with pupils + eyelids, eyebrows, swappable mouths.
// LedFace: 5x5 LED matrix showing animated expressions (micro:bit).
import * as THREE from 'three';

const EXPRESSIONS = ['idle', 'angry', 'hurt', 'happy', 'ko', 'attack', 'smug', 'bow', 'surprised'];

export class CartoonFace {
  /**
   * @param {object} o eyeSize, eyeSpacing, eyeColor, pupilColor, browColor, mouthWidth, mouthY, eyeY, lidColor, glowEyes
   */
  constructor(o = {}) {
    this.group = new THREE.Group();
    const eyeSize = o.eyeSize ?? 0.12;
    const spacing = o.eyeSpacing ?? 0.16;
    const eyeY = o.eyeY ?? 0;
    this.eyeSize = eyeSize;
    const white = new THREE.MeshStandardMaterial({ color: o.eyeColor ?? 0xffffff, roughness: 0.25, emissive: o.glowEyes ? (o.eyeColor ?? 0xffffff) : 0x000000, emissiveIntensity: o.glowEyes ? 0.9 : 0 });
    const pupilM = new THREE.MeshStandardMaterial({ color: o.pupilColor ?? 0x111111, roughness: 0.2, emissive: o.pupilGlow ?? 0x000000, emissiveIntensity: o.pupilGlow ? 3 : 0 });
    const lidM = new THREE.MeshStandardMaterial({ color: o.lidColor ?? 0x333333, roughness: 0.6 });
    const browM = new THREE.MeshStandardMaterial({ color: o.browColor ?? 0x1a1a1a, roughness: 0.6 });
    this.materials = [white, pupilM, lidM, browM];
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * spacing, eyeY, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeSize, 24, 16), white);
      ball.scale.set(1, 1.15, 0.55);
      eye.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeSize * 0.45, 16, 12), pupilM);
      pupil.position.z = eyeSize * 0.42; pupil.scale.set(1, 1.1, 0.5);
      eye.add(pupil);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(eyeSize * 0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(eyeSize * 0.15, eyeSize * 0.2, eyeSize * 0.62);
      eye.add(shine);
      // upper lid: a half-sphere shell that rotates down over the eye
      const lidPivot = new THREE.Group();
      const lid = new THREE.Mesh(new THREE.SphereGeometry(eyeSize * 1.08, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidM);
      lid.scale.set(1, 1.15, 0.62);
      // dome covers the top half; the pivot rotates it forward (closed) or back (open)
      lidPivot.add(lid);
      eye.add(lidPivot);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(eyeSize * 2.0, eyeSize * 0.38, eyeSize * 0.4), browM);
      brow.position.set(0, eyeSize * 1.55, eyeSize * 0.25);
      eye.add(brow);
      this.group.add(eye);
      this.eyes.push({ eye, pupil, lidPivot, brow, side: s });
    }

    // mouths
    const mouthM = new THREE.MeshStandardMaterial({ color: o.mouthColor ?? 0x2a0a0a, roughness: 0.5 });
    const teethM = new THREE.MeshStandardMaterial({ color: 0xf6f6f0, roughness: 0.3 });
    this.materials.push(mouthM, teethM);
    const mw = o.mouthWidth ?? 0.2;
    const my = o.mouthY ?? -0.2;
    this.mouthY = my;
    const arc = (curve, rad) => {
      const g = new THREE.TorusGeometry(mw / 2, rad, 8, 20, Math.PI);
      const m = new THREE.Mesh(g, mouthM);
      m.rotation.z = curve > 0 ? Math.PI : 0;
      m.scale.y = 0.7;
      return m;
    };
    this.mouths = {
      smile: arc(1, mw * 0.08),
      frown: arc(-1, mw * 0.08),
      o: new THREE.Mesh(new THREE.TorusGeometry(mw * 0.22, mw * 0.08, 8, 20), mouthM),
      grit: (() => {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(mw, mw * 0.32, mw * 0.12), mouthM); g.add(box);
        const teeth = new THREE.Mesh(new THREE.BoxGeometry(mw * 0.9, mw * 0.2, mw * 0.06), teethM);
        teeth.position.z = mw * 0.05; g.add(teeth);
        for (let i = -2; i <= 2; i++) {
          const gap = new THREE.Mesh(new THREE.BoxGeometry(mw * 0.02, mw * 0.22, mw * 0.08), mouthM);
          gap.position.set(i * mw * 0.18, 0, mw * 0.07); g.add(gap);
        }
        return g;
      })(),
      flat: new THREE.Mesh(new THREE.BoxGeometry(mw * 0.8, mw * 0.06, mw * 0.08), mouthM),
      zigzag: (() => {
        const pts = [];
        for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(-mw / 2 + i * mw / 6, (i % 2 ? 1 : -1) * mw * 0.08, 0));
        return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 24, mw * 0.04, 6), mouthM);
      })(),
    };
    for (const m of Object.values(this.mouths)) { m.position.y = my; m.visible = false; this.group.add(m); }
    this.mouths.flat.visible = true;

    this.expression = 'idle';
    this._blink = 0; this._blinkTimer = 2 + Math.random() * 2;
    this._look = new THREE.Vector2();
    this._lookTarget = new THREE.Vector2();
    this._lookTimer = 0;
    this.setExpression('idle');
  }

  setExpression(name) {
    if (!EXPRESSIONS.includes(name)) name = 'idle';
    this.expression = name;
    const map = { idle: 'flat', angry: 'grit', hurt: 'zigzag', happy: 'smile', ko: 'zigzag', attack: 'grit', smug: 'smile', bow: 'smile', surprised: 'o' };
    for (const [k, m] of Object.entries(this.mouths)) m.visible = k === map[name];
  }

  update(dt, t) {
    // blinking
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0) { this._blink = 0.14; this._blinkTimer = 2 + Math.random() * 3; }
    if (this._blink > 0) this._blink -= dt;
    const blinkClose = this._blink > 0 ? 1 : 0;

    // wandering gaze
    this._lookTimer -= dt;
    if (this._lookTimer <= 0) { this._lookTarget.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3); this._lookTimer = 0.6 + Math.random() * 1.5; }
    if (this.expression === 'angry' || this.expression === 'attack') this._lookTarget.set(0, 0);
    this._look.lerp(this._lookTarget, 1 - Math.exp(-10 * dt));

    const e = this.expression;
    // eyelid closure: 0 open .. 1 closed ; brow angle (inner corner down = angry)
    let lid = 0.12, browRot = 0, browY = 1.55, pupilScale = 1, squash = 1;
    if (e === 'angry' || e === 'attack') { lid = 0.42; browRot = 0.55; browY = 1.25; }
    if (e === 'hurt') { lid = 0.6; browRot = -0.4; browY = 1.45; pupilScale = 0.6; }
    if (e === 'happy' || e === 'smug') { lid = e === 'smug' ? 0.5 : 0.25; browRot = -0.2; browY = 1.7; }
    if (e === 'surprised') { lid = 0; browRot = -0.3; browY = 1.95; pupilScale = 0.55; squash = 1.15; }
    if (e === 'bow') { lid = 0.75; browRot = -0.15; browY = 1.6; }
    if (e === 'ko') { lid = 0.95; browRot = -0.35; browY = 1.4; }
    lid = Math.max(lid, blinkClose);
    for (const ey of this.eyes) {
      ey.lidPivot.rotation.x = THREE.MathUtils.lerp(ey.lidPivot.rotation.x, -1.3 + lid * 2.85, 1 - Math.exp(-25 * dt));
      ey.brow.rotation.z = THREE.MathUtils.lerp(ey.brow.rotation.z, -ey.side * browRot, 1 - Math.exp(-15 * dt));
      ey.brow.position.y = THREE.MathUtils.lerp(ey.brow.position.y, this.eyeSize * browY, 1 - Math.exp(-15 * dt));
      ey.pupil.position.x = this._look.x * this.eyeSize * 0.6;
      ey.pupil.position.y = this._look.y * this.eyeSize * 0.6;
      const ps = e === 'ko' ? 0.4 + 0.2 * Math.sin(t * 20) : pupilScale;
      ey.pupil.scale.set(ps, ps * 1.1, 0.5);
      ey.eye.scale.setScalar(squash);
    }
    // angry mouth jitter
    const grit = this.mouths.grit;
    grit.position.x = (e === 'angry' || e === 'attack') ? Math.sin(t * 40) * 0.004 : 0;
  }
}

// ---------------------------------------------------------------------------
const LED_PATTERNS = {
  idle: ['00000', '01010', '00000', '01110', '00000'],
  blink: ['00000', '00000', '00000', '01110', '00000'],
  angry: ['10001', '01010', '00000', '01110', '10001'],
  attack: ['11011', '01010', '00000', '11111', '01110'],
  hurt: ['10001', '01010', '00000', '01110', '10001'],
  hurt2: ['01010', '10001', '00000', '01110', '10001'],
  happy: ['00000', '01010', '00000', '10001', '01110'],
  smug: ['00000', '11011', '00000', '10001', '01110'],
  surprised: ['01010', '01010', '00000', '00100', '01010'],
  ko: ['10101', '01010', '10101', '00000', '01110'],
  ko2: ['01010', '10101', '01010', '00000', '01110'],
  bow: ['00000', '11011', '00000', '01110', '00000'],
  heart: ['01010', '11111', '11111', '01110', '00100'],
};

export class LedFace {
  constructor({ pitch = 0.07, size = 0.032, color = 0xff2020 } = {}) {
    this.group = new THREE.Group();
    this.color = new THREE.Color(color);
    this.leds = [];
    const geo = new THREE.BoxGeometry(size, size * 1.6, size * 0.6);
    this.onMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3.2, roughness: 0.3 });
    this.offMat = new THREE.MeshStandardMaterial({ color: 0x3a1010, roughness: 0.4 });
    this.materials = [this.offMat];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const m = new THREE.Mesh(geo, this.offMat);
        m.position.set((c - 2) * pitch, (2 - r) * pitch, 0);
        this.group.add(m);
        this.leds.push(m);
      }
    }
    this.expression = 'idle';
    this._t = 0; this._blinkTimer = 2;
    this.show('idle');
  }

  show(name) {
    const p = LED_PATTERNS[name] || LED_PATTERNS.idle;
    for (let i = 0; i < 25; i++) this.leds[i].material = p[Math.floor(i / 5)][i % 5] === '1' ? this.onMat : this.offMat;
  }

  setExpression(name) { this.expression = name; this.show(name); }

  update(dt, t) {
    this._t += dt;
    const e = this.expression;
    if (e === 'idle' || e === 'smug') {
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0) { this.show('blink'); if (this._blinkTimer < -0.12) { this.show(e); this._blinkTimer = 1.5 + Math.random() * 2.5; } }
    } else if (e === 'hurt') {
      this.show(Math.floor(t * 12) % 2 ? 'hurt' : 'hurt2');
    } else if (e === 'ko') {
      this.show(Math.floor(t * 6) % 2 ? 'ko' : 'ko2');
    }
    this.onMat.emissiveIntensity = 2.6 + Math.sin(t * 8) * 0.4;
  }
}
