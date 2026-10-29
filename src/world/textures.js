// Procedural canvas textures: circuit boards, labels, signs, gradients.
import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function finish(canvas, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Printed-circuit-board texture: solder mask colour, copper traces, pads, vias, silkscreen.
 * Returns { map, emissiveMap } — the emissive map lights up the traces.
 */
export function pcbTexture({ base = '#1d4d2b', trace = '#e8b84a', seed = 1, size = 1024, silk = '#f2f2f2', glow = '#ffffff', density = 1 } = {}) {
  const key = `pcb:${base}:${trace}:${seed}:${size}:${density}`;
  if (cache.has(key)) return cache.get(key);
  const r = rng(seed);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = size;
  const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, size, size);

  // solder mask with subtle noise
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + r() * 0.03})`;
    g.fillRect(r() * size, r() * size, 2 + r() * 6, 2 + r() * 6);
  }
  const grid = size / 32;
  const snap = v => Math.round(v / grid) * grid;
  g.lineCap = ge.lineCap = 'round'; g.lineJoin = ge.lineJoin = 'round';

  // traces: Manhattan + 45° routing
  const nTraces = Math.round(70 * density);
  for (let i = 0; i < nTraces; i++) {
    let x = snap(r() * size), y = snap(r() * size);
    const w = r() < 0.2 ? 7 : (r() < 0.6 ? 4 : 2.5);
    g.strokeStyle = trace; g.lineWidth = w; g.globalAlpha = 0.85;
    ge.strokeStyle = glow; ge.lineWidth = w * 0.7; ge.globalAlpha = 0.35 + r() * 0.65;
    g.beginPath(); g.moveTo(x, y); ge.beginPath(); ge.moveTo(x, y);
    const segs = 2 + Math.floor(r() * 5);
    for (let s = 0; s < segs; s++) {
      const len = grid * (2 + Math.floor(r() * 8));
      const dir = Math.floor(r() * 8);
      const dx = [1, 1, 0, -1, -1, -1, 0, 1][dir], dy = [0, 1, 1, 1, 0, -1, -1, -1][dir];
      x += dx * len; y += dy * len;
      g.lineTo(x, y); ge.lineTo(x, y);
    }
    g.stroke(); ge.stroke();
    g.globalAlpha = 1; ge.globalAlpha = 1;
    // pad at the end
    g.fillStyle = trace; g.beginPath(); g.arc(x, y, w * 1.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(x, y, w * 0.6, 0, Math.PI * 2); g.fill();
  }
  // vias
  for (let i = 0; i < 160 * density; i++) {
    const x = snap(r() * size), y = snap(r() * size);
    g.fillStyle = trace; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
  }
  // SMD pads + silkscreen outlines
  for (let i = 0; i < 26 * density; i++) {
    const x = snap(r() * size), y = snap(r() * size);
    const w = grid * (1 + Math.floor(r() * 3)), h = grid * (1 + Math.floor(r() * 2));
    g.strokeStyle = silk; g.globalAlpha = 0.6; g.lineWidth = 2;
    g.strokeRect(x - 4, y - 4, w + 8, h + 8); g.globalAlpha = 1;
    g.fillStyle = trace;
    g.fillRect(x, y, w * 0.3, h); g.fillRect(x + w * 0.7, y, w * 0.3, h);
    g.fillStyle = silk; g.globalAlpha = 0.7;
    g.font = `bold ${Math.round(grid * 0.45)}px monospace`;
    g.fillText(['R', 'C', 'U', 'D', 'Q', 'L'][Math.floor(r() * 6)] + Math.floor(r() * 99), x, y - 8);
    g.globalAlpha = 1;
  }
  const res = { map: finish(c), emissiveMap: finish(e) };
  cache.set(key, res);
  return res;
}

/** Text label on a transparent or coloured background. */
export function textTexture(text, {
  width = 512, height = 128, font = 'bold 72px "Orbitron", "Segoe UI", Arial, sans-serif',
  color = '#ffffff', bg = null, stroke = null, align = 'center', glow = null, rtl = false,
} = {}) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, width, height); }
  g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  if (rtl) g.direction = 'rtl';
  const x = align === 'center' ? width / 2 : (align === 'left' ? 10 : width - 10);
  if (glow) { g.shadowColor = glow; g.shadowBlur = 24; }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 6; g.strokeText(text, x, height / 2); }
  g.fillStyle = color; g.fillText(text, x, height / 2);
  const t = finish(c, { repeat: [1, 1] });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Glowing electronic sign: border, text, small icon. */
export function signTexture(title, subtitle, accent = '#3cf2ff') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(5,8,20,0.92)'; g.fillRect(0, 0, 1024, 384);
  g.strokeStyle = accent; g.lineWidth = 10; g.shadowColor = accent; g.shadowBlur = 30;
  g.strokeRect(18, 18, 988, 348);
  g.shadowBlur = 20;
  g.fillStyle = accent; g.font = 'bold 92px "Orbitron", "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(title, 512, 160);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.font = '44px "Segoe UI", Arial, sans-serif';
  g.fillText(subtitle, 512, 275);
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft round sprite for particles. */
export function dotTexture() {
  if (cache.has('dot')) return cache.get('dot');
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  cache.set('dot', t);
  return t;
}

/** Animated "data pulse" stripe texture for glowing cables (scroll .offset.x). */
export function pulseTexture(color = '#3cf2ff') {
  const key = 'pulse:' + color;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 8;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.7, 'rgba(0,0,0,1)');
  grd.addColorStop(0.85, color);
  grd.addColorStop(0.9, '#ffffff');
  grd.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 8);
  const t = finish(c, { repeat: [6, 1] });
  cache.set(key, t);
  return t;
}

/** Brushed metal / IC package texture with printed marking. */
export function chipTexture(label = 'ATMEGA328P', sub = '', bg = '#151515') {
  const key = `chip:${label}:${sub}:${bg}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    g.fillRect(0, Math.random() * 512, 512, 1);
  }
  g.fillStyle = 'rgba(230,230,230,0.85)';
  g.font = 'bold 56px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 256, sub ? 220 : 256);
  if (sub) { g.font = '36px monospace'; g.fillText(sub, 256, 300); }
  g.beginPath(); g.arc(60, 60, 18, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Vertical sky gradient texture for a background sphere. */
export function gradientTexture(top, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top); grd.addColorStop(1, bottom);
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
