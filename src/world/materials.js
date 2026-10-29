// Shared material + geometry helpers (cached to keep draw state small).
import * as THREE from 'three';

const matCache = new Map();

export function std(color, opts = {}) {
  const key = 'std:' + color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...opts });
  matCache.set(key, m);
  return m;
}

export function metal(color = 0xc8ccd2, rough = 0.3) {
  return std(color, { metalness: 0.9, roughness: rough });
}

export function gold() { return std(0xf2c14e, { metalness: 1, roughness: 0.28 }); }

export function glow(color, intensity = 2.5) {
  const key = 'glow:' + color + ':' + intensity;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  matCache.set(key, m);
  return m;
}

/** Unique (uncached) emissive material — for things that animate their glow. */
export function glowUnique(color, intensity = 2.5) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

export function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

/** Rounded rectangle extruded into a board shape (PCB slab). */
export function roundedBoardGeometry(w, h, depth, radius = 0.06, holes = []) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + radius, y);
  s.lineTo(x + w - radius, y); s.quadraticCurveTo(x + w, y, x + w, y + radius);
  s.lineTo(x + w, y + h - radius); s.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  s.lineTo(x + radius, y + h); s.quadraticCurveTo(x, y + h, x, y + h - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  for (const hdef of holes) {
    const p = new THREE.Path();
    p.absarc(hdef[0], hdef[1], hdef[2], 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.15, bevelSize: Math.min(radius * 0.4, depth * 0.3), bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Map the front face of an extruded board to a texture with planar UVs. */
export function planarUV(geometry, w, h) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

export function shadowAll(obj, cast = true, receive = false) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
