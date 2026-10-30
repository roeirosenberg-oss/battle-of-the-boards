// Procedural 3D models of the five electronic enemies, built on EnemyRig.
import * as THREE from 'three';
import { EnemyRig } from './rig.js';
import { CartoonFace, LedFace } from './face.js';
import { pcbTexture, chipTexture } from '../world/textures.js';
import { roundedBoardGeometry, planarUV } from '../world/materials.js';

/** Board front texture: PCB background + custom silkscreen drawing. */
function boardTexture({ base, trace, seed, aspect, draw }) {
  const W = 1024, H = Math.round(1024 / aspect);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const pcb = pcbTexture({ base, trace, seed, size: 512, density: 0.8 });
  g.fillStyle = g.createPattern(pcb.map.image, 'repeat'); g.fillRect(0, 0, W, H);
  if (draw) draw(g, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function board(rig, { w, h, d, color, map, radius = 0.05, holes = [] }) {
  const geo = planarUV(roundedBoardGeometry(w, h, d, radius, holes), w, h);
  const front = rig.mat(0xffffff, { map, roughness: 0.55, metalness: 0.15 });
  const edge = rig.mat(color, { roughness: 0.6 });
  // ExtrudeGeometry groups: 0 = caps (front/back), 1 = sides
  const mesh = new THREE.Mesh(geo, [front, edge]);
  mesh.castShadow = true;
  return mesh;
}

function pinRow(rig, n, { pitch = 0.025, height = 0.06, color = 0xd4a017, housing = 0x111111, dir = 'z' } = {}) {
  const g = new THREE.Group();
  const hous = new THREE.Mesh(new THREE.BoxGeometry(n * pitch, pitch * 1.1, pitch * 1.1), rig.mat(housing, { roughness: 0.6 }));
  g.add(hous);
  const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(pitch * 0.25, pitch * 0.25, height), rig.mat(color, { metalness: 1, roughness: 0.3 }), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m.makeTranslation(-n * pitch / 2 + pitch / 2 + i * pitch, 0, dir === 'z' ? height / 2 : 0);
    pins.setMatrixAt(i, m);
  }
  g.add(pins);
  return g;
}

function attachFace(rig, face, parent, pos) {
  face.group.position.copy(pos);
  parent.add(face.group);
  rig.registerMaterials(face.materials);
  return face;
}

// ----------------------------------------------------------------- 1. Resistor
function buildResistor() {
  const rig = new EnemyRig({
    hipHeight: 0.46, hipWidth: 0.1, legUpper: 0.24, legLower: 0.22, legThick: 0.024, footSize: 0.13,
    shoulderY: 0.52, shoulderX: 0.27, armUpper: 0.24, armLower: 0.22, armThick: 0.022, fistSize: 0.095,
    limbColor: 0xcfd4da, jointColor: 0x9aa1aa, fistColor: 0xd8202f, footColor: 0x3a2a1a, fistStyle: 'glove',
  });
  const body = new THREE.Group();
  body.position.y = 0.48;
  const beige = rig.mat(0xd9c39a, { roughness: 0.55 });
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.55, 10, 24), beige);
  capsule.castShadow = true;
  body.add(capsule);
  // colour bands: red-red-brown-gold = 220 Ω
  const bands = [[0xc81e1e, 0.2], [0xc81e1e, 0.08], [0x7a3b12, -0.04], [0xd4af37, -0.24]];
  for (const [c, y] of bands) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.256, 0.256, 0.055, 28, 1, true), rig.mat(c, { roughness: 0.4, metalness: c === 0xd4af37 ? 0.8 : 0.1 }));
    b.position.y = y; body.add(b);
  }
  // end caps (resistor bulges)
  for (const y of [0.33, -0.33]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), beige);
    cap.scale.y = 0.55; cap.position.y = y; body.add(cap);
  }
  // curly wire "hair" — the top lead
  const hairPts = [];
  for (let i = 0; i <= 30; i++) { const a = i / 30; hairPts.push(new THREE.Vector3(Math.sin(a * 12) * 0.05 * a, 0.42 + a * 0.28, Math.cos(a * 12) * 0.05 * a)); }
  const hair = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hairPts), 60, 0.012, 6), rig.limbM);
  body.add(hair);
  const face = attachFace(rig, new CartoonFace({ eyeSize: 0.075, eyeSpacing: 0.095, eyeY: 0.05, mouthWidth: 0.13, mouthY: -0.1, lidColor: 0xc9b285, browColor: 0x2a1a0a }), body, new THREE.Vector3(0, 0.07, 0.235));
  // little cheeks that blush red when angry
  const cheekM = rig.mat(0xff6a6a, { transparent: true, opacity: 0.0, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), cheekM);
    ch.scale.z = 0.3; ch.position.set(s * 0.15, -0.03, 0.23); body.add(ch);
  }
  rig.torso.add(body);
  rig.addHurtbox(body, 0.38);
  return {
    rig, face, lookHeight: 0.95,
    update(dt, t, state) {
      cheekM.opacity = (face.expression === 'angry' || face.expression === 'attack') ? 0.6 + Math.sin(t * 10) * 0.2 : 0;
      hair.rotation.y = Math.sin(t * 3) * 0.3;
    },
  };
}

// ----------------------------------------------------------------- 2. Arduino Uno
function buildArduino() {
  const rig = new EnemyRig({
    hipHeight: 0.74, hipWidth: 0.17, legUpper: 0.37, legLower: 0.35, legThick: 0.045, footSize: 0.2,
    shoulderY: 0.55, shoulderX: 0.64, armUpper: 0.34, armLower: 0.32, armThick: 0.045, fistSize: 0.1,
    limbColor: 0xaab2bc, jointColor: 0x15151a, fistColor: 0x1f6fd6, footColor: 0x14141a, fistStyle: 'robot', mechanical: true,
  });
  const W = 1.16, H = 0.9;
  const tex = boardTexture({
    base: '#0a63b8', trace: '#9fd3ff', seed: 21, aspect: W / H,
    draw(g, w, h) {
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.font = 'bold 150px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('UNO', w * 0.62, h * 0.82);
      g.font = 'bold 52px "Segoe UI", Arial, sans-serif';
      g.fillText('ARDUINO', w * 0.62, h * 0.9);
      // infinity logo
      g.lineWidth = 16; g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.ellipse(w * 0.33, h * 0.84, 46, 30, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(w * 0.43, h * 0.84, 46, 30, 0, 0, Math.PI * 2); g.stroke();
      g.font = 'bold 30px monospace'; g.fillText('DIGITAL (PWM~)', w * 0.55, h * 0.12);
      g.fillText('POWER        ANALOG IN', w * 0.62, h * 0.66);
    },
  });
  const pcb = board(rig, { w: W, h: H, d: 0.06, color: 0x0a4f94, map: tex, radius: 0.04, holes: [[-0.5, 0.36, 0.025], [0.48, -0.36, 0.025]] });
  const body = new THREE.Group(); body.position.y = 0.52;
  body.add(pcb);
  const silver = rig.mat(0xc9ced6, { metalness: 0.95, roughness: 0.25 });
  const black = rig.mat(0x141414, { roughness: 0.5 });
  // USB-B port (top-left, sticks out of the board edge)
  const usb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.2), silver);
  usb.position.set(-0.52, 0.22, 0.12); body.add(usb);
  const usbHole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.01), black);
  usbHole.position.set(-0.645, 0.22, 0.12); usbHole.rotation.y = Math.PI / 2; body.add(usbHole);
  // barrel jack
  const jack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.18), black);
  jack.position.set(-0.5, -0.28, 0.12); body.add(jack);
  // headers along top and bottom edges
  const topH = pinRow(rig, 18, { pitch: 0.036 }); topH.position.set(0.12, 0.4, 0.06); body.add(topH);
  const botH1 = pinRow(rig, 8, { pitch: 0.036 }); botH1.position.set(-0.05, -0.4, 0.06); body.add(botH1);
  const botH2 = pinRow(rig, 6, { pitch: 0.036 }); botH2.position.set(0.32, -0.4, 0.06); body.add(botH2);
  // ATmega328P DIP chip with legs
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.05), rig.mat(0xffffff, { map: chipTexture('ATMEGA328P', '', '#131313') }));
  chip.position.set(0.22, -0.24, 0.06); body.add(chip);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.03, 0.04), silver, 28);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    m4.makeTranslation(0.22 - 0.21 + i * 0.032, -0.24 + 0.072, 0.045); legs.setMatrixAt(i * 2, m4);
    m4.makeTranslation(0.22 - 0.21 + i * 0.032, -0.24 - 0.072, 0.045); legs.setMatrixAt(i * 2 + 1, m4);
  }
  body.add(legs);
  // crystal, reset button, status LEDs
  const xtal = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.06, 4, 10), silver);
  xtal.rotation.z = Math.PI / 2; xtal.position.set(-0.12, -0.27, 0.05); body.add(xtal);
  const reset = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), rig.mat(0xd01818));
  reset.rotation.x = Math.PI / 2; reset.position.set(-0.4, 0.38, 0.05); body.add(reset);
  const ledOn = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.02), rig.mat(0x22ff55, { emissive: 0x22ff55, emissiveIntensity: 3 }));
  ledOn.position.set(0.48, 0.12, 0.04); body.add(ledOn);
  const ledLM = rig.mat(0xffaa00, { emissive: 0xffaa00, emissiveIntensity: 3 });
  const ledL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.02), ledLM);
  ledL.position.set(0.48, 0.18, 0.04); body.add(ledL);
  const face = attachFace(rig, new CartoonFace({ eyeSize: 0.12, eyeSpacing: 0.17, eyeY: 0.06, mouthWidth: 0.2, mouthY: -0.14, lidColor: 0x0a4f94, browColor: 0x0b1f3a }), body, new THREE.Vector3(-0.02, 0.07, 0.06));
  rig.torso.add(body);
  rig.addHurtbox(body, 0.55);
  return {
    rig, face, lookHeight: 1.25,
    update(dt, t) {
      ledLM.emissiveIntensity = (Math.floor(t * 4) % 2) ? 3.5 : 0.2; // "Blink" sketch
    },
  };
}

// ----------------------------------------------------------------- 3. micro:bit V2
function buildMicrobit() {
  const rig = new EnemyRig({
    hipHeight: 0.56, hipWidth: 0.12, legUpper: 0.27, legLower: 0.26, legThick: 0.034, footSize: 0.15,
    shoulderY: 0.46, shoulderX: 0.5, armUpper: 0.27, armLower: 0.25, armThick: 0.034, fistSize: 0.09,
    limbColor: 0x3a3a40, jointColor: 0xd4a017, fistColor: 0x1a1a1a, footColor: 0x111111, fistStyle: 'glove',
  });
  const W = 0.9, H = 0.73;
  const tex = boardTexture({
    base: '#121212', trace: '#3a3a3a', seed: 33, aspect: W / H,
    draw(g, w, h) {
      // gold edge connector at the bottom
      g.fillStyle = '#d4a017'; g.fillRect(0, h * 0.82, w, h * 0.18);
      g.fillStyle = '#121212';
      for (let i = 0; i < 40; i++) g.fillRect(i * w / 40 + 2, h * 0.82, 4, h * 0.18);
      g.fillStyle = '#ffffff'; g.font = 'bold 40px "Segoe UI", Arial'; g.textAlign = 'center';
      ['0', '1', '2', '3V', 'GND'].forEach((lbl, i) => g.fillText(lbl, w * (0.1 + i * 0.2), h * 0.79));
      g.font = 'bold 46px "Segoe UI", Arial'; g.fillText('micro:bit', w * 0.5, h * 0.14);
      g.font = 'bold 54px Arial'; g.fillText('A', w * 0.12, h * 0.32); g.fillText('B', w * 0.88, h * 0.32);
    },
  });
  const holes = [[-0.36, -0.3, 0.045], [-0.18, -0.3, 0.045], [0, -0.3, 0.045], [0.18, -0.3, 0.045], [0.36, -0.3, 0.045]];
  const pcb = board(rig, { w: W, h: H, d: 0.05, color: 0x111111, map: tex, radius: 0.08, holes });
  const body = new THREE.Group(); body.position.y = 0.42;
  body.add(pcb);
  // gold rings around the big edge-connector holes
  const goldM = rig.mat(0xd4a017, { metalness: 1, roughness: 0.25 });
  for (const [x, y] of holes) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), goldM);
    ring.position.set(x, y, 0.028); body.add(ring);
  }
  // buttons A and B
  for (const s of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), rig.mat(0xe8e8e8));
    base.position.set(s * 0.34, 0.02, 0.035); body.add(base);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), rig.mat(0x111111));
    btn.rotation.x = Math.PI / 2; btn.position.set(s * 0.34, 0.02, 0.06); body.add(btn);
  }
  // touch logo (gold oval with two dots)
  const logo = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 24), goldM);
  logo.scale.set(1.5, 1, 1); logo.position.set(0, 0.22, 0.03); body.add(logo);
  for (const s of [-1, 1]) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), goldM);
    dot.position.set(s * 0.035, 0.22, 0.03); body.add(dot);
  }
  // LED matrix face
  const face = new LedFace({ pitch: 0.075, size: 0.03, color: 0xff2222 });
  face.group.position.set(0, 0.0, 0.035);
  body.add(face.group);
  rig.registerMaterials(face.materials);
  // small antenna-like speaker on top
  const spk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), rig.mat(0x222222));
  spk.rotation.x = Math.PI / 2; spk.position.set(0.25, 0.22, 0.03); body.add(spk);
  rig.torso.add(body);
  rig.addHurtbox(body, 0.45);
  return { rig, face, lookHeight: 1.0, update() {} };
}

// ----------------------------------------------------------------- 4. Raspberry Pi
function buildRaspberry() {
  const rig = new EnemyRig({
    hipHeight: 0.84, hipWidth: 0.24, legUpper: 0.42, legLower: 0.4, legThick: 0.075, footSize: 0.3,
    shoulderY: 0.62, shoulderX: 0.86, armUpper: 0.4, armLower: 0.38, armThick: 0.07, fistSize: 0.17,
    limbColor: 0x7d8790, jointColor: 0xc51a4a, fistColor: 0x2c2c33, footColor: 0x1d1d22, fistStyle: 'robot', mechanical: true,
  });
  const W = 1.55, H = 1.02;
  const tex = boardTexture({
    base: '#1e7a3a', trace: '#f0d27a', seed: 44, aspect: W / H,
    draw(g, w, h) {
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 44px "Segoe UI", Arial'; g.textAlign = 'left';
      g.fillText('Raspberry Pi 5', w * 0.05, h * 0.93);
      g.font = '28px monospace'; g.fillText('© Raspberry Pi Ltd · 2023', w * 0.05, h * 0.86);
    },
  });
  const pcb = board(rig, { w: W, h: H, d: 0.07, color: 0x15602c, map: tex, radius: 0.06, holes: [[-0.7, 0.44, 0.03], [0.4, 0.44, 0.03], [-0.7, -0.44, 0.03], [0.4, -0.44, 0.03]] });
  const body = new THREE.Group(); body.position.y = 0.62;
  body.add(pcb);
  const silver = rig.mat(0xc9ced6, { metalness: 0.95, roughness: 0.25 });
  // 40-pin GPIO (2 rows) along the top edge
  const gp1 = pinRow(rig, 20, { pitch: 0.045 }); gp1.position.set(-0.22, 0.44, 0.06); body.add(gp1);
  const gp2 = pinRow(rig, 20, { pitch: 0.045 }); gp2.position.set(-0.22, 0.395, 0.06); body.add(gp2);
  // SoC with metal lid
  const soc = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.05), rig.mat(0xffffff, { map: chipTexture('BCM2712', 'ARM CORTEX-A76', '#9ba3ab'), metalness: 0.8, roughness: 0.35 }));
  soc.position.set(-0.3, -0.24, 0.06); body.add(soc);
  const ram = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), rig.mat(0xffffff, { map: chipTexture('LPDDR4X', '8GB', '#141414') }));
  ram.position.set(0.0, -0.26, 0.06); body.add(ram);
  // USB-A stacks and Ethernet on the right edge
  for (let i = 0; i < 3; i++) {
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), silver);
    port.position.set(0.66, 0.2 - i * 0.29, 0.17); body.add(port);
    const slotM = rig.mat(i === 1 ? 0x1b4fd8 : (i === 0 ? 0x111111 : 0x1b4fd8));
    for (const yy of (i === 2 ? [0] : [0.06, -0.06])) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.22), slotM);
      slot.position.set(0.81, 0.2 - i * 0.29 + yy, 0.17); body.add(slot);
    }
  }
  // micro-HDMI + USB-C on bottom edge
  for (let i = 0; i < 3; i++) {
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), silver);
    hd.position.set(-0.55 + i * 0.18, -0.5, 0.06); body.add(hd);
  }
  // raspberry logo (red berry of spheres + leaves)
  const berry = new THREE.Group();
  const red = rig.mat(0xc51a4a, { roughness: 0.4 });
  const pos = [[0, 0], [-0.03, 0.03], [0.03, 0.03], [-0.045, -0.01], [0.045, -0.01], [-0.02, -0.04], [0.02, -0.04], [0, -0.07]];
  for (const [x, y] of pos) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), red); s.position.set(x, y, 0); berry.add(s); }
  for (const s of [-1, 1]) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6), rig.mat(0x3cae4f)); leaf.scale.set(1.3, 0.5, 0.4); leaf.position.set(s * 0.03, 0.065, 0); leaf.rotation.z = s * 0.4; berry.add(leaf); }
  berry.position.set(0.32, -0.3, 0.06); berry.scale.setScalar(1.6); body.add(berry);
  // heat-sink fan on top (spins)
  const fan = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 20), rig.mat(0x202020)); fan.add(ring);
  const blades = new THREE.Group();
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.01), rig.mat(0x333333)); b.position.x = 0.05; const h = new THREE.Group(); h.rotation.z = i * Math.PI / 3; h.add(b); blades.add(h); }
  fan.add(blades); fan.position.set(-0.3, -0.24, 0.1); body.add(fan);
  const face = attachFace(rig, new CartoonFace({ eyeSize: 0.12, eyeSpacing: 0.2, eyeY: 0.08, mouthWidth: 0.26, mouthY: -0.12, lidColor: 0x15602c, browColor: 0x0a2a12, pupilColor: 0x330010 }), body, new THREE.Vector3(-0.1, 0.12, 0.07));
  // heavy brow plate
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.06), rig.mat(0x5a626b, { metalness: 0.9, roughness: 0.3 }));
  brow.position.set(-0.1, 0.4, 0.08); body.add(brow);
  // shoulder armour plates
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), rig.mat(0xc51a4a, { metalness: 0.4, roughness: 0.4 }));
    plate.position.set(s * 0.86, 0.66, 0); rig.hips.add(plate);
  }
  rig.torso.add(body);
  rig.addHurtbox(body, 0.75);
  return {
    rig, face, lookHeight: 1.5,
    update(dt) { blades.rotation.z += dt * 18; },
  };
}

// ----------------------------------------------------------------- 5. ESP32 (final boss)
function buildESP32() {
  const rig = new EnemyRig({
    hipHeight: 0.98, hipWidth: 0.22, legUpper: 0.5, legLower: 0.48, legThick: 0.08, footSize: 0.32,
    shoulderY: 0.95, shoulderX: 0.62, armUpper: 0.5, armLower: 0.48, armThick: 0.08, fistSize: 0.19,
    limbColor: 0x3a3f4a, jointColor: 0x3cf2ff, jointGlow: 0x3cf2ff, fistColor: 0x17171e, footColor: 0x101014, fistStyle: 'robot', mechanical: true,
  });
  const W = 0.95, H = 1.78;
  const tex = boardTexture({
    base: '#15151d', trace: '#6a6a7a', seed: 55, aspect: W / H,
    draw(g, w, h) {
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.textAlign = 'center';
      g.font = 'bold 64px "Segoe UI", Arial'; g.fillText('ESP32', w * 0.5, h * 0.72);
      g.font = 'bold 40px "Segoe UI", Arial'; g.fillText('DEVKIT V1', w * 0.5, h * 0.76);
      g.font = '30px monospace';
      const left = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'];
      const right = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'];
      left.forEach((l, i) => { g.textAlign = 'left'; g.fillText(l, w * 0.12, h * (0.1 + i * 0.058)); });
      right.forEach((l, i) => { g.textAlign = 'right'; g.fillText(l, w * 0.88, h * (0.1 + i * 0.058)); });
      g.textAlign = 'center'; g.fillText('BOOT', w * 0.75, h * 0.94); g.fillText('EN', w * 0.25, h * 0.94);
    },
  });
  const pcb = board(rig, { w: W, h: H, d: 0.08, color: 0x0e0e14, map: tex, radius: 0.05 });
  const body = new THREE.Group(); body.position.y = 0.78;
  body.add(pcb);
  // pin headers down both long edges
  for (const s of [-1, 1]) {
    const hdr = pinRow(rig, 15, { pitch: 0.1, height: 0.12, color: 0xd4a017 });
    hdr.rotation.z = Math.PI / 2; hdr.position.set(s * 0.43, -0.05, 0.07); body.add(hdr);
  }
  // WROOM module: RF shield can + antenna
  const can = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.09), rig.mat(0xffffff, { map: chipTexture('ESP32-WROOM-32', 'Wi-Fi + BT', '#7d828a'), metalness: 0.7, roughness: 0.42 }));
  can.position.set(0, 0.42, 0.09); body.add(can);
  const antBase = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.03), rig.mat(0x0d0d12));
  antBase.position.set(0, 0.8, 0.06); body.add(antBase);
  const zig = [];
  for (let i = 0; i <= 10; i++) zig.push(new THREE.Vector3(-0.28 + i * 0.056, (i % 2 ? 0.07 : -0.07), 0));
  const antennaMat = rig.mat(0xd4a017, { metalness: 1, roughness: 0.3, emissive: 0x3cf2ff, emissiveIntensity: 0.0 });
  const antenna = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zig, false, 'catmullrom', 0), 60, 0.012, 6), antennaMat);
  antenna.position.set(0, 0.8, 0.08); body.add(antenna);
  // glowing horns (Wi-Fi antennas) that emit arcs
  const horns = [];
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 10), rig.mat(0x2a2f3a, { metalness: 0.9, roughness: 0.3 }));
    horn.position.set(s * 0.36, 1.05, 0); horn.rotation.z = -s * 0.35; body.add(horn);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), rig.mat(0x3cf2ff, { emissive: 0x3cf2ff, emissiveIntensity: 4 }));
    tip.position.set(s * 0.43, 1.25, 0); body.add(tip);
    horns.push(tip);
  }
  // bottom: micro-USB, BOOT/EN buttons, regulator, red LED
  const usb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.08), rig.mat(0xc9ced6, { metalness: 0.95, roughness: 0.25 }));
  usb.position.set(0, -0.86, 0.06); body.add(usb);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.04), rig.mat(0xd8d8d8));
    b.position.set(s * 0.24, -0.76, 0.06); body.add(b);
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), rig.mat(0x111111));
    k.rotation.x = Math.PI / 2; k.position.set(s * 0.24, -0.76, 0.09); body.add(k);
  }
  const reg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), rig.mat(0xffffff, { map: chipTexture('AMS1117', '3.3', '#121212') }));
  reg.position.set(0, -0.55, 0.06); body.add(reg);
  const pwrLed = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.02), rig.mat(0xff2020, { emissive: 0xff2020, emissiveIntensity: 3 }));
  pwrLed.position.set(0.2, -0.6, 0.05); body.add(pwrLed);
  // glowing core in the chest (pulses faster each phase)
  const coreMat = rig.mat(0x3cf2ff, { emissive: 0x3cf2ff, emissiveIntensity: 2.5, transparent: true, opacity: 0.9 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), coreMat);
  core.position.set(0, -0.12, 0.08); body.add(core);
  const coreLight = new THREE.PointLight(0x3cf2ff, 1.2, 3, 2); coreLight.position.set(0, -0.12, 0.4); body.add(coreLight);
  // face on the RF shield: glowing LED eyes
  const face = attachFace(rig, new CartoonFace({ eyeSize: 0.1, eyeSpacing: 0.15, eyeY: 0.04, eyeColor: 0x5fe8f5, glowEyes: true, pupilColor: 0x001018, mouthWidth: 0.22, mouthY: -0.14, lidColor: 0x9aa0a8, browColor: 0x30343c }), body, new THREE.Vector3(0, 0.42, 0.14));
  rig.torso.add(body);
  rig.addHurtbox(body, 0.95);
  return {
    rig, face, lookHeight: 1.85, horns, core,
    update(dt, t, state) {
      const phase = state?.phase ?? 0;
      core.rotation.y += dt * (2 + phase * 3); core.rotation.x += dt;
      coreMat.emissiveIntensity = 2 + Math.sin(t * (4 + phase * 4)) * 1.2 + phase;
      coreLight.intensity = 0.8 + phase * 0.8 + Math.sin(t * 8) * 0.3;
      antennaMat.emissiveIntensity = 0.3 + phase * 0.8 + Math.max(0, Math.sin(t * 6)) * 0.6;
      const col = phase >= 2 ? 0xff3a5a : (phase === 1 ? 0xb06bff : 0x3cf2ff);
      coreMat.color.setHex(col); coreMat.emissive.setHex(col); coreMat.userData.baseEmissive.setHex(col); coreLight.color.setHex(col);
    },
  };
}


// ----------------------------------------------------------------- Easter egg: the Tin Woodman
// Based on W. W. Denslow's original 1900 illustrations for "The Wonderful Wizard
// of Oz" (public domain): tin body with rivets, funnel hat, axe over the shoulder.
function buildTinWoodman() {
  const tinCol = 0xb9c0c7;
  const rig = new EnemyRig({
    hipHeight: 0.92, hipWidth: 0.12, legUpper: 0.44, legLower: 0.42, legThick: 0.07, footSize: 0.2,
    shoulderY: 0.62, shoulderX: 0.27, armUpper: 0.32, armLower: 0.3, armThick: 0.055, fistSize: 0.07,
    limbColor: tinCol, jointColor: 0x8d949b, fistColor: tinCol, footColor: 0x9aa1a8, fistStyle: 'robot', mechanical: false,
  });
  const tin = rig.mat(tinCol, { metalness: 0.9, roughness: 0.32 });
  const tinDark = rig.mat(0x8d949b, { metalness: 0.9, roughness: 0.4 });
  const body = new THREE.Group();
  // stove-pipe torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.62, 24), tin);
  torso.position.y = 0.33; body.add(torso);
  for (const y of [0.06, 0.62]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 28), tinDark);
    band.rotation.x = Math.PI / 2; band.position.y = y; body.add(band);
  }
  // rivets down the front
  const rivetGeo = new THREE.SphereGeometry(0.014, 8, 6);
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(rivetGeo, tinDark);
    r.position.set(0, 0.12 + i * 0.09, 0.195); body.add(r);
  }
  // neck + can-shaped head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12), tinDark);
  neck.position.y = 0.68; body.add(neck);
  const head = new THREE.Group(); head.position.y = 0.84; body.add(head);
  const skull = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 24), tin);
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 24), tinDark);
  jaw.rotation.x = Math.PI / 2; jaw.position.y = -0.1; head.add(jaw);
  // the funnel hat: a cone opening upward with a spout on top
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.05, 0.16, 24, 1, true), rig.mat(tinCol, { metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }));
  funnel.position.y = 0.19; funnel.rotation.x = Math.PI; head.add(funnel);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.14, 12), tin);
  spout.position.y = 0.33; head.add(spout);
  // simple friendly face
  const face = new CartoonFace({ eyeSize: 0.032, eyeSpacing: 0.05, eyeY: 0.03, mouthWidth: 0.07, mouthY: -0.05, lidColor: 0x9aa1a8, browColor: 0x50565c, pupilColor: 0x1a1a1a });
  face.group.position.set(0, 0, 0.115); head.add(face.group);
  rig.registerMaterials(face.materials);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 10), tin);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.005, 0.15); head.add(nose);
  rig.torso.add(body);
  // the axe, held in the right hand and resting on the shoulder
  const axe = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 8), rig.mat(0x8a5a2b, { roughness: 0.8 }));
  handle.position.y = 0.3; axe.add(handle);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.015), rig.mat(0xd8dde2, { metalness: 1, roughness: 0.25 }));
  blade.position.set(0.07, 0.62, 0); axe.add(blade);
  axe.rotation.set(-0.5, 0, 0);
  axe.position.y = -0.1;
  rig.arms.R.wrist.add(axe);
  rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { rig, face, lookHeight: 1.7, update() {} };
}

export const MODEL_BUILDERS = {
  tinwoodman: buildTinWoodman,
  resistor: buildResistor,
  arduino: buildArduino,
  microbit: buildMicrobit,
  raspberry: buildRaspberry,
  esp32: buildESP32,
};
