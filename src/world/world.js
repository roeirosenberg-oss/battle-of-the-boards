// World exploration: the route through the electronic kingdom, five themed zones,
// arenas, lighting, sky, fog and ambient animation.
import * as THREE from 'three';
import { ROUTE, ZONES, ENEMIES } from '../config.js';
import { pcbTexture, signTexture, pulseTexture, dotTexture, gradientTexture, chipTexture, textTexture } from './textures.js';
import { std, metal, gold, glow, glowUnique, basic, roundedBoardGeometry, planarUV, shadowAll } from './materials.js';
import { ArcPool } from '../fx/lightning.js';
import { buildThroneHall } from './throneHall.js';
import { mergeStatic } from './staticMerge.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const UP = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.animators = [];   // (dt, t) => void
    this.t = 0;

    // ----- route -----
    const pts = [
      [0, 0], [0, -14], [5, -36], [3, -58], [-6, -80], [-9, -104], [-1, -128], [7, -152], [6, -176],
      [-3, -200], [-5, -224], [0, -246], [0, -268], [0, -300], [0, -330],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.length = this.curve.getLength();
    this._tmpA = new THREE.Vector3(); this._tmpB = new THREE.Vector3();

    this._buildLights();
    this._buildSky();
    this._buildGround();
    this._buildRoad();
    this._buildArenas();
    this._buildZones();
    this._buildDust();

    this.throneHall = buildThroneHall(this);
    this.root.add(this.throneHall.group);
    this.animators.push((dt, t) => this.throneHall.update(dt, t));

    // performance: merge static meshes that share a material into a few large draw calls
    this.root.updateMatrixWorld(true);
    this.mergeStats = mergeStatic(this.root);
  }

  /** Position / tangent / side vector at a distance along the route. */
  frame(d) {
    const u = THREE.MathUtils.clamp(d / this.length, 0, 1);
    const pos = this.curve.getPointAt(u, new THREE.Vector3());
    const tangent = this.curve.getTangentAt(u, new THREE.Vector3()).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, UP).normalize(); // points to the right
    return { pos, tangent, side };
  }

  /** Place an object at route distance d with lateral offset (right = positive). */
  place(obj, d, lateral = 0, y = 0, faceRoad = true) {
    const f = this.frame(d);
    obj.position.copy(f.pos).addScaledVector(f.side, lateral);
    obj.position.y = y;
    if (faceRoad) {
      // look toward the road centre line
      const target = f.pos.clone(); target.y = y;
      if (Math.abs(lateral) > 0.01) obj.lookAt(target);
      else obj.lookAt(f.pos.clone().add(f.tangent));
    }
    return obj;
  }

  zoneAt(d) {
    const e = ROUTE.encounterAt;
    for (let i = 0; i < e.length; i++) if (d < e[i] + 10) return i;
    return 5;
  }

  // ---------------------------------------------------------------- lights
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x9fb8ff, 0x2a1a3a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dd, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -18; s.right = 18; s.top = 18; s.bottom = -18; s.near = 1; s.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.ambientAccent = new THREE.PointLight(0xffffff, 0, 30, 1.6);
    this.scene.add(this.ambientAccent);
  }

  // ---------------------------------------------------------------- sky
  _buildSky() {
    this.skyColors = ZONES.map(z => [new THREE.Color(z.sky[0]), new THREE.Color(z.sky[1])]);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(ZONES[0].sky[0]) },
        bottom: { value: new THREE.Color(ZONES[0].sky[1]) },
        time: { value: 0 },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; uniform float time; varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          float h = clamp(vP.y*0.5+0.5, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(h, 0.8));
          // horizon glow band
          c += vec3(0.25,0.12,0.35) * exp(-abs(vP.y)*9.0) * 0.6;
          // stars
          vec2 sp = vec2(atan(vP.z, vP.x)*120.0, vP.y*240.0);
          vec2 g = floor(sp);
          float d = length(fract(sp) - 0.5);
          float s = step(0.994, hash(g)) * smoothstep(0.18, 0.05, d) * smoothstep(0.1, 0.5, vP.y);
          c += s * (0.6 + 0.4*sin(time*3.0 + hash(g)*20.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(ZONES[0].fog, 0.018);
    this.fogColors = ZONES.map(z => new THREE.Color(z.fog));
  }

  // ---------------------------------------------------------------- ground
  _buildGround() {
    // one large board per zone, slightly offset in height to avoid z-fighting
    const e = ROUTE.encounterAt;
    const centers = [e[0] - 12, e[1] - 10, e[2] - 10, e[3] - 10, e[4] - 10];
    centers.forEach((d, i) => {
      const z = ZONES[i];
      const tex = pcbTexture({ base: z.ground, trace: z.trace, seed: 11 + i * 7, glow: '#' + new THREE.Color(z.accent).getHexString() });
      const map = tex.map.clone(); map.needsUpdate = true; map.repeat.set(6, 6);
      const em = tex.emissiveMap.clone(); em.needsUpdate = true; em.repeat.set(6, 6);
      const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: z.accent, emissiveIntensity: 0.55, roughness: 0.75, metalness: 0.2 });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(110, 70), mat);
      plane.rotation.x = -Math.PI / 2;
      const f = this.frame(d);
      plane.position.set(f.pos.x, -0.03 - i * 0.004, f.pos.z);
      plane.rotation.z = Math.atan2(f.tangent.x, f.tangent.z) * 0 + Math.atan2(-f.tangent.x, -f.tangent.z);
      plane.receiveShadow = true;
      this.root.add(plane);
      // gentle pulse of the copper traces
      this.animators.push((dt, t) => { mat.emissiveIntensity = 0.4 + 0.25 * Math.sin(t * 1.3 + i); });
    });
    // dark underlay to the horizon
    const under = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), std(0x07060c, { roughness: 1 }));
    under.rotation.x = -Math.PI / 2; under.position.set(0, -0.08, -160);
    this.root.add(under);
  }

  // ---------------------------------------------------------------- road
  _buildRoad() {
    // The path is a flat bundle of thick, coloured cables lying side by side —
    // Shir walks on top of them. A few cables carry a soft travelling data pulse.
    const colors = [0xe02424, 0x1f6fe0, 0x22b14c, 0xf2c200, 0xf2f2f2, 0x1a1a1a, 0xff7a1a, 0x9b4dff, 0x14c8c8, 0xff4fa3];
    const n = colors.length, radius = 0.16, spacing = 0.335;
    const len = ROUTE.throneAt - 40; // ends at the throne-hall entrance (the hall has its carpet)
    const samples = 260;
    const cableMats = colors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.05 }));
    const pulseTex = {}, glowMats = {};
    colors.forEach((col, c) => {
      if (c % 3 !== 1) return;
      const tex = pulseTexture('#' + new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.4).getHexString()).clone();
      tex.needsUpdate = true; tex.repeat.set(12, 1);
      pulseTex[c] = tex;
      glowMats[c] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 });
      const speed = 0.25 + c * 0.03;
      this.animators.push(dt => { tex.offset.x -= dt * speed; });
    });
    // the bundle runs between the arenas (each arena platform sits on top of it)
    const pieces = [];
    let from = 0;
    for (const e of ROUTE.encounterAt) { pieces.push([from, e - 2 - 5.7]); from = e - 2 + 5.7; }
    pieces.push([from, len]);
    for (const [p0, p1] of pieces) {
    const segLen = p1 - p0;
    const segSamples = Math.max(8, Math.round(samples * segLen / len));
    for (let c = 0; c < n; c++) {
      const lateral = (c - (n - 1) / 2) * spacing;
      const pts = [];
      for (let i = 0; i <= segSamples; i++) {
        const d = p0 + (i / segSamples) * segLen;
        const f = this.frame(d);
        // tiny organic wobble so it reads as real cables, not a painted road
        const wob = Math.sin(d * 0.35 + c * 1.7) * 0.03;
        pts.push(f.pos.clone().addScaledVector(f.side, lateral + wob).setY(0.0));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, segSamples * 3, radius, 12, false);
      const mat = cableMats[c];
      const cable = new THREE.Mesh(geo, mat);
      cable.receiveShadow = true;
      this.root.add(cable);
      if (c % 3 === 1) {
        const tex = pulseTex[c];
        const glowTube = new THREE.Mesh(new THREE.TubeGeometry(curve, segSamples * 3, radius * 1.04, 12, false), glowMats[c]);
        glowTube.renderOrder = 2;
        this.root.add(glowTube);
      }
    }
    }
    // dark trough under the bundle so no ground shows between the cables
    const under = [];
    const uv = [], idx = [];
    const half = (n * spacing) / 2 + 0.05;
    for (let i = 0; i <= samples; i++) {
      const f = this.frame((i / samples) * len);
      const l = f.pos.clone().addScaledVector(f.side, -half), r = f.pos.clone().addScaledVector(f.side, half);
      under.push(l.x, 0.01, l.z, r.x, 0.01, r.z); uv.push(0, i, 1, i);
      if (i < samples) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(under, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const trough = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.9 }));
    trough.receiveShadow = true;
    this.root.add(trough);
  }

  // ---------------------------------------------------------------- arenas
  _buildArenas() {
    this.arenas = [];
    ROUTE.encounterAt.forEach((d, i) => {
      const z = ZONES[i];
      const g = new THREE.Group();
      const center = d - 2; // between the player stop and the enemy
      this.place(g, center, 0, 0, false);
      const f = this.frame(center);
      g.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
      // platform
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.3, 0.36, 48), std(0x101018, { metalness: 0.7, roughness: 0.35 }));
      disc.position.y = 0.0; // top at 0.18 — covers the cable bundle
      disc.receiveShadow = true; g.add(disc);
      // glowing rings
      const ringMat = glowUnique(z.accent, 2.2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.06, 8, 96), ringMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.035, 8, 64), ringMat);
      ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.2; g.add(ring2);
      // corner posts (boxing ring made of capacitors) with rope cables
      const postPts = [];
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        const px = Math.cos(a) * 5.0, pz = Math.sin(a) * 5.0;
        if (pz < -1 && Math.abs(px) < 4) continue;
        const post = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 20), std(i === 4 ? 0x262a3a : 0x1f4fb0, { roughness: 0.35 }));
        body.position.y = 0.8; post.add(body);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.06, 20), metal());
        top.position.y = 1.62; post.add(top);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.286, 0.286, 1.2, 20, 1, true, 0, 0.7), std(0xdddddd));
        stripe.position.y = 0.8; post.add(stripe);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), ringMat);
        led.position.y = 1.75; post.add(led);
        post.position.set(px, 0, pz);
        shadowAll(post);
        g.add(post);
        postPts.push(new THREE.Vector3(px, 1.2, pz));
      }
      // arena spotlight
      const spot = new THREE.PointLight(z.accent, 0, 14, 1.4);
      spot.position.set(0, 5, -1.5); g.add(spot);
      this.root.add(g);
      this.arenas.push({ group: g, ringMat, spot, baseIntensity: 2.2 });
      this.animators.push((dt, t) => {
        ringMat.emissiveIntensity = 1.6 + Math.sin(t * 3 + i) * 0.6;
      });
    });
  }

  setArenaActive(i, on) {
    const a = this.arenas[i];
    if (a) a.spot.intensity = on ? 22 : 0;
  }

  // ---------------------------------------------------------------- zones
  _buildZones() {
    const e = ROUTE.encounterAt;
    const ranges = [[-6, e[0] + 8], [e[0] + 8, e[1] + 8], [e[1] + 8, e[2] + 8], [e[2] + 8, e[3] + 8], [e[3] + 8, e[4] + 10]];
    const builders = [this._zoneResistor, this._zoneArduino, this._zoneMatrix, this._zoneFactory, this._zoneStorm];
    this.arcs = new ArcPool(this.root, 10, { color: 0xa8f7ff, jitter: 0.25 });
    this.animators.push(dt => this.arcs.update(dt));
    ranges.forEach(([a, b], i) => {
      builders[i].call(this, a, b, rng(100 + i * 31), ZONES[i]);
      // entrance sign
      const sign = new THREE.Group();
      const acc = '#' + new THREE.Color(ZONES[i].accent).getHexString();
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.575), new THREE.MeshBasicMaterial({ map: signTexture(ZONES[i].name.toUpperCase(), `Zone ${i + 1} · Opponent: ${ENEMIES[i].name}`, acc), toneMapped: false, transparent: true }));
      panel.position.y = 3.4;
      const back = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.75, 0.08), std(0x0a0a12, { metalness: 0.6 }));
      back.position.set(0, 3.4, -0.06);
      const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), metal()); pole1.position.set(-1.9, 1.7, -0.08);
      const pole2 = pole1.clone(); pole2.position.x = 1.9;
      sign.add(panel, back, pole1, pole2);
      const sd = Math.max(4, a + 9);
      const f = this.frame(sd);
      sign.position.copy(f.pos).addScaledVector(f.side, 3.6);
      sign.lookAt(this.frame(sd - 12).pos);
      shadowAll(sign);
      this.root.add(sign);
    });
  }

  _scatter(a, b, r, count, minLat, maxLat, fn) {
    for (let k = 0; k < count; k++) {
      const d = a + r() * (b - a);
      const side = r() < 0.5 ? -1 : 1;
      const lat = side * (minLat + r() * (maxLat - minLat));
      // keep arenas clear
      if (ROUTE.encounterAt.some(e => Math.abs(d - (e - 2)) < 7) && Math.abs(lat) < 7.5) continue;
      fn(d, lat, k);
    }
  }

  _giantResistor(bands = [0xa0522d, 0x111111, 0xd02020, 0xd4af37]) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.2, 8, 20), std(0xd9c49a, { roughness: 0.6 }));
    body.rotation.z = Math.PI / 2; g.add(body);
    bands.forEach((c, i) => {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.565, 0.565, 0.22, 24, 1, true), std(c));
      band.rotation.z = Math.PI / 2; band.position.x = -0.8 + i * 0.5 + (i === 3 ? 0.25 : 0); g.add(band);
    });
    for (const s of [-1, 1]) {
      const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), metal());
      lead.rotation.z = Math.PI / 2; lead.position.x = s * 2.3; g.add(lead);
      const down = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), metal());
      down.position.set(s * 3.4, -0.8, 0); g.add(down);
    }
    return shadowAll(g);
  }

  _capacitor(color = 0x1d3fa8, h = 3) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, h, 28), std(color, { roughness: 0.3, metalness: 0.2 }));
    body.position.y = h / 2; g.add(body);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.805, 0.805, h * 0.9, 28, 1, true, 0, 0.9), std(0xc9d3e6));
    stripe.position.y = h / 2; g.add(stripe);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.8, 0.05, 28), metal(0xcfd6df, 0.25));
    top.position.y = h + 0.02; g.add(top);
    for (const rot of [0, Math.PI / 2]) {
      const x = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.06), std(0x777777));
      x.position.y = h + 0.05; x.rotation.y = rot; g.add(x);
    }
    return shadowAll(g);
  }

  _giantLED(color) {
    const g = new THREE.Group();
    const m = glowUnique(color, 2.2);
    m.transparent = true; m.opacity = 0.92;
    const dome = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.8, 8, 20), m);
    dome.position.y = 2.5; g.add(dome);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.15, 24), m);
    rim.position.y = 1.85; g.add(rim);
    for (const s of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.85 + (s > 0 ? 0 : 0.3), 6), metal());
      leg.position.set(s, (1.85 + (s > 0 ? 0 : 0.3)) / 2 - (s > 0 ? 0 : 0.3), 0); g.add(leg);
    }
    const light = new THREE.PointLight(color, 3, 7, 2); light.position.y = 2.5; g.add(light);
    g.userData.mat = m; g.userData.light = light;
    return g;
  }

  _zoneResistor(a, b, r, z) {
    const bandSets = [[0xa0522d, 0x111111, 0xd02020, 0xd4af37], [0xd02020, 0xd02020, 0xa0522d, 0xd4af37], [0xffd000, 0x8a2be2, 0xd02020, 0xc0c0c0], [0x2060ff, 0x808080, 0xff8000, 0xd4af37]];
    this._scatter(a, b, r, 26, 7, 26, (d, lat) => {
      const choice = r();
      if (choice < 0.42) {
        const res = this._giantResistor(bandSets[Math.floor(r() * bandSets.length)]);
        this.place(res, d, lat, 1.6, false);
        res.rotation.y = r() * Math.PI;
        const s = 0.8 + r() * 1.2; res.scale.setScalar(s); res.position.y = 1.6 * s;
        this.root.add(res);
      } else if (choice < 0.75) {
        const cap = this._capacitor([0x1d3fa8, 0x111111, 0x6b1fa8][Math.floor(r() * 3)], 2 + r() * 4);
        this.place(cap, d, lat, 0, false); this.root.add(cap);
      } else {
        const colors = [0xff3344, 0x33ff66, 0x3399ff, 0xffcc22];
        const led = this._giantLED(colors[Math.floor(r() * colors.length)]);
        this.place(led, d, lat, 0, false); this.root.add(led);
        const ph = r() * 6;
        this.animators.push((dt, t) => {
          const k = 0.5 + 0.5 * Math.sin(t * 2 + ph);
          led.userData.mat.emissiveIntensity = 0.8 + 2.2 * k; led.userData.light.intensity = 1 + 3 * k;
        });
      }
    });
    // overhead glowing cables
  }

  _cables(a, b, r, count, color) {
    for (let k = 0; k < count; k++) {
      const d = a + 6 + r() * (b - a - 12);
      const f = this.frame(d);
      const p0 = f.pos.clone().addScaledVector(f.side, -14).setY(0);
      const p3 = f.pos.clone().addScaledVector(f.side, 14).setY(0);
      const p1 = p0.clone().lerp(p3, 0.3).setY(9 + r() * 4).addScaledVector(f.tangent, (r() - 0.5) * 6);
      const p2 = p0.clone().lerp(p3, 0.7).setY(9 + r() * 4).addScaledVector(f.tangent, (r() - 0.5) * 6);
      const c = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
      const tex = pulseTexture('#' + new THREE.Color(color).getHexString()).clone(); tex.needsUpdate = true; tex.repeat.set(8, 1);
      const outer = new THREE.Mesh(new THREE.TubeGeometry(c, 64, 0.22, 8), std(0x15151c, { roughness: 0.4 }));
      const inner = new THREE.Mesh(new THREE.TubeGeometry(c, 64, 0.235, 8), new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false }));
      outer.castShadow = true;
      this.root.add(outer, inner);
      const sp = 0.4 + r() * 0.6;
      this.animators.push(dt => { tex.offset.x -= dt * sp; });
    }
  }

  _zoneArduino(a, b, r, z) {
    // blue board "buildings" with chips, header pin forests, USB towers
    this._scatter(a, b, r, 18, 8, 28, (d, lat) => {
      const pick = r();
      if (pick < 0.45) {
        const w = 3 + r() * 4, h = 5 + r() * 9;
        const g = new THREE.Group();
        const geo = planarUV(roundedBoardGeometry(w, h, 0.4, 0.3), w, h);
        const tex = pcbTexture({ base: '#0b5aa8', trace: '#cfe8ff', seed: Math.floor(r() * 999), size: 512, density: 0.6 });
        const board = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0x2aa0ff, emissiveIntensity: 0.7, roughness: 0.5 }));
        board.position.y = h / 2; g.add(board);
        const chip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.12, 0.3), new THREE.MeshStandardMaterial({ map: chipTexture('ATMEGA328P'), roughness: 0.6 }));
        chip.position.set(0, h * 0.45, 0.3); g.add(chip);
        for (let p = 0; p < 6; p++) {
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.1), glow([0x00ff66, 0xffaa00, 0xff2222][p % 3], 3));
          led.position.set(-w / 2 + 0.5 + p * 0.3, h * 0.8, 0.26); g.add(led);
        }
        shadowAll(g);
        this.place(g, d, lat, 0, true);
        this.root.add(g);
      } else if (pick < 0.8) {
        // header pin forest
        const n = 8 + Math.floor(r() * 10);
        const g = new THREE.Group();
        const hb = new THREE.Mesh(new THREE.BoxGeometry(n * 0.5, 0.6, 0.6), std(0x111114));
        hb.position.y = 0.3; g.add(hb);
        const pinGeo = new THREE.BoxGeometry(0.08, 2.4, 0.08);
        const pins = new THREE.InstancedMesh(pinGeo, gold(), n);
        const m = new THREE.Matrix4();
        for (let q = 0; q < n; q++) { m.makeTranslation(-n * 0.25 + 0.25 + q * 0.5, 1.4, 0); pins.setMatrixAt(q, m); }
        pins.castShadow = true;
        g.add(pins);
        shadowAll(g);
        this.place(g, d, lat, 0, true);
        this.root.add(g);
      } else {
        // servo motor with spinning horn (moving machinery)
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.2), std(0x1b5fd6, { roughness: 0.4 }));
        body.position.y = 0.8; g.add(body);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16), std(0xeeeeee));
        top.position.set(0.6, 1.75, 0); g.add(top);
        const horn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.35), std(0xf5f5f5));
        horn.userData.dynamic = true;
        horn.position.set(0.6, 1.95, 0); g.add(horn);
        shadowAll(g);
        this.place(g, d, lat, 0, true);
        this.root.add(g);
        const sp = 0.5 + r() * 2;
        this.animators.push((dt, t) => { horn.rotation.y = Math.sin(t * sp) * 1.4; });
      }
    });
  }

  _zoneMatrix(a, b, r, z) {
    // giant 5x5 LED matrix walls with animated patterns
    const patterns = [
      ['01010', '11111', '11111', '01110', '00100'],  // heart
      ['00000', '01010', '00000', '10001', '01110'],  // smile
      ['00100', '01110', '10101', '00100', '00100'],  // arrow up
      ['10001', '01010', '00100', '01010', '10001'],  // X
      ['11111', '10001', '10101', '10001', '11111'],  // target
      ['00100', '00100', '11111', '00100', '00100'],  // plus
    ];
    const walls = [];
    this._scatter(a, b, r, 12, 9, 24, (d, lat) => {
      const g = new THREE.Group();
      const s = 0.8 + r() * 0.7;
      const back = new THREE.Mesh(new THREE.BoxGeometry(6.2, 6.2, 0.4), std(0x0c0c0e, { roughness: 0.5 }));
      back.position.y = 4; g.add(back);
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.75, 0.2), new THREE.MeshBasicMaterial({ toneMapped: false }), 25);
      const m = new THREE.Matrix4();
      for (let q = 0; q < 25; q++) {
        const cx = q % 5, cy = Math.floor(q / 5);
        m.makeTranslation(-2.4 + cx * 1.2, 6.4 - cy * 1.2, 0.25);
        inst.setMatrixAt(q, m);
        inst.setColorAt(q, new THREE.Color(0x220000));
      }
      g.add(inst);
      for (const sx of [-2.6, 2.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), metal());
        leg.position.set(sx, 0.6, 0); g.add(leg);
      }
      g.scale.setScalar(s);
      shadowAll(g); inst.castShadow = false;
      this.place(g, d, lat, 0, true);
      this.root.add(g);
      walls.push({ inst, phase: Math.floor(r() * 6), color: new THREE.Color([0xff2a2a, 0xff3355, 0xff6020][Math.floor(r() * 3)]) });
    });
    const on = new THREE.Color(), off = new THREE.Color(0x1a0204);
    let acc = 0, step = 0;
    this.animators.push((dt) => {
      acc += dt; if (acc < 0.6) return; acc = 0; step++;
      for (const w of walls) {
        const p = patterns[(step + w.phase) % patterns.length];
        for (let q = 0; q < 25; q++) {
          const lit = p[Math.floor(q / 5)][q % 5] === '1';
          w.inst.setColorAt(q, lit ? on.copy(w.color).multiplyScalar(1.6) : off);
        }
        w.inst.instanceColor.needsUpdate = true;
      }
    });
    // giant A / B buttons
    this._scatter(a, b, r, 6, 8, 18, (d, lat, k) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 2.4), std(0x222226, { metalness: 0.6 }));
      base.position.y = 0.3; g.add(base);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 24), std(0x111111, { roughness: 0.3 }));
      btn.userData.dynamic = true;
      btn.position.y = 0.85; g.add(btn);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: textTexture(k % 2 ? 'B' : 'A', { width: 256, height: 128, font: 'bold 110px Arial' }), transparent: true }));
      lbl.position.set(0, 0.61, 1.21); g.add(lbl);
      shadowAll(g);
      this.place(g, d, lat, 0, true);
      this.root.add(g);
      const ph = r() * 6;
      this.animators.push((dt, t) => { btn.position.y = 0.85 - Math.max(0, Math.sin(t * 2.5 + ph)) * 0.25; });
    });
  }

  _zoneFactory(a, b, r, z) {
    // chips as buildings, rotating fans, conveyor of chips, pistons
    this._scatter(a, b, r, 14, 8, 26, (d, lat) => {
      const pick = r();
      const g = new THREE.Group();
      if (pick < 0.4) {
        const w = 4 + r() * 4, h = 2 + r() * 5;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), [std(0x151515), std(0x151515), new THREE.MeshStandardMaterial({ map: chipTexture(['BCM2712', 'LPDDR4', 'RP1', 'SD CARD'][Math.floor(r() * 4)]), roughness: 0.5 }), std(0x151515), std(0x151515), std(0x151515)]);
        body.position.y = h / 2; g.add(body);
        const legGeo = new THREE.BoxGeometry(0.25, 0.8, 0.5);
        const n = Math.floor(w / 0.6);
        const legs = new THREE.InstancedMesh(legGeo, metal(), n * 2);
        const m = new THREE.Matrix4();
        for (let q = 0; q < n; q++) {
          m.makeTranslation(-w / 2 + 0.3 + q * 0.6, 0.4, w / 2 + 0.2); legs.setMatrixAt(q * 2, m);
          m.makeTranslation(-w / 2 + 0.3 + q * 0.6, 0.4, -w / 2 - 0.2); legs.setMatrixAt(q * 2 + 1, m);
        }
        g.add(legs);
      } else if (pick < 0.7) {
        // heatsink + fan
        const hs = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 3.6), metal(0x9aa3ad, 0.4));
        hs.position.y = 0.3; g.add(hs);
        for (let f = 0; f < 9; f++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 3.6), metal(0xb7c0ca, 0.35));
          fin.position.set(-1.6 + f * 0.4, 1.4, 0); g.add(fin);
        }
        const fanHub = new THREE.Group(); fanHub.position.set(0, 2.5, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 32), std(0x111111)); ring.rotation.x = Math.PI / 2; fanHub.add(ring);
        const blades = new THREE.Group();
        blades.userData.dynamic = true;
        for (let k = 0; k < 7; k++) {
          const bl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.45), std(0x202020)); bl.position.x = 0.75; bl.rotation.x = 0.4;
          const holder = new THREE.Group(); holder.rotation.y = k * Math.PI * 2 / 7; holder.add(bl); blades.add(holder);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16), std(0xd11e5b)); blades.add(hub);
        fanHub.add(blades); g.add(fanHub);
        const sp = 6 + r() * 6;
        this.animators.push(dt => { blades.rotation.y += dt * sp; });
      } else {
        // piston press
        const frame = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 3), std(0x333338, { metalness: 0.7 }));
        frame.position.y = 5; g.add(frame);
        for (const sx of [-1.3, 1.3]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), std(0xd11e5b)); col.position.set(sx, 2.5, 0); g.add(col); }
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 12), metal()); g.add(rod);
        const head = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), metal(0x8892a0, 0.4)); g.add(head);
        rod.userData.dynamic = head.userData.dynamic = true;
        const anvil = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.2), std(0x1f6b34)); anvil.position.y = 0.4; g.add(anvil);
        const ph = r() * 6;
        this.animators.push((dt, t) => {
          const k = Math.pow(Math.abs(Math.sin(t * 1.6 + ph)), 6);
          head.position.y = 3.6 - k * 2.2; rod.position.y = head.position.y + 1.2;
        });
      }
      shadowAll(g);
      this.place(g, d, lat, 0, true);
      this.root.add(g);
    });
    // conveyor belts running alongside the road with moving chips
    for (const side of [-1, 1]) {
      const d0 = a + 4, d1 = b - 4;
      const nChips = 24;
      const chipGeo = new THREE.BoxGeometry(0.8, 0.25, 0.8);
      const chips = new THREE.InstancedMesh(chipGeo, new THREE.MeshStandardMaterial({ map: chipTexture('RP2040', '', '#1b1b1b') }), nChips);
      chips.castShadow = true;
      this.root.add(chips);
      // belt
      const beltPts = [];
      for (let i = 0; i <= 40; i++) { const f = this.frame(d0 + (d1 - d0) * i / 40); beltPts.push(f.pos.clone().addScaledVector(f.side, side * 5.8).setY(0.5)); }
      const beltCurve = new THREE.CatmullRomCurve3(beltPts);
      const belt = new THREE.Mesh(new THREE.TubeGeometry(beltCurve, 120, 0.45, 4, false), std(0x1a1a1a, { roughness: 0.9 }));
      belt.scale.y = 1; belt.receiveShadow = true;
      this.root.add(belt);
      const dummy = new THREE.Object3D();
      let off = 0;
      this.animators.push((dt) => {
        off = (off + dt * 0.04 * side + 1) % 1;
        for (let q = 0; q < nChips; q++) {
          const u = (q / nChips + off) % 1;
          beltCurve.getPointAt(u, dummy.position); dummy.position.y = 1.05;
          dummy.rotation.y = q; dummy.updateMatrix(); chips.setMatrixAt(q, dummy.matrix);
        }
        chips.instanceMatrix.needsUpdate = true;
      });
    }
  }

  _zoneStorm(a, b, r, z) {
    // antenna towers with pulsing Wi-Fi rings, big ESP modules, sky lightning
    const towers = [];
    this._scatter(a, b, r, 8, 10, 26, (d, lat) => {
      const g = new THREE.Group();
      const h = 10 + r() * 8;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, h, 6, 8, true), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, wireframe: true, metalness: 0.8 }));
      mast.position.y = h / 2; g.add(mast);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, h, 6), metal());
      core.position.y = h / 2; g.add(core);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), glowUnique(0x3cf2ff, 4));
      tip.position.y = h + 0.2; g.add(tip);
      tip.userData.dynamic = true;
      const rings = [];
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: 0x3cf2ff, transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        ring.rotation.x = Math.PI / 2; ring.position.y = h + 0.2; g.add(ring); rings.push(ring);
        ring.userData.dynamic = true;
      }
      shadowAll(g);
      this.place(g, d, lat, 0, false);
      this.root.add(g);
      towers.push({ g, h, tip });
      const ph = r() * 3;
      this.animators.push((dt, t) => {
        rings.forEach((ring, k) => {
          const u = ((t * 0.6 + ph + k / 3) % 1);
          ring.scale.setScalar(0.5 + u * 4); ring.material.opacity = (1 - u) * 0.4;
        });
      });
    });
    this._scatter(a, b, r, 8, 9, 22, (d, lat) => {
      const g = new THREE.Group();
      const w = 3.5, h = 5.5;
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), std(0x0f0f14));
      pcb.position.y = h / 2 + 0.3; g.add(pcb);
      const can = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, h * 0.5, 0.4), new THREE.MeshStandardMaterial({ map: chipTexture('ESP32-WROOM', '-32E', '#a9adb3'), metalness: 0.85, roughness: 0.3 }));
      can.position.set(0, h * 0.45, 0.3); g.add(can);
      const ant = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, h * 0.18, 0.05), glow(0xd4a017, 0.6));
      ant.position.set(0, h * 0.88, 0.18); g.add(ant);
      shadowAll(g);
      this.place(g, d, lat, 0, true);
      this.root.add(g);
    });
    // sky lightning between tower tips occasionally
    let timer = 1;
    this.animators.push((dt) => {
      timer -= dt;
      if (timer > 0 || towers.length < 2) return;
      timer = 0.4 + Math.random() * 1.6;
      const t1 = towers[Math.floor(Math.random() * towers.length)];
      const a1 = t1.tip.getWorldPosition(new THREE.Vector3());
      const b1 = a1.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 8 + Math.random() * 10, (Math.random() - 0.5) * 20));
      this.arcs.fire(a1, b1, 0.25);
      this._flash = 0.25;
    });
  }

  // ---------------------------------------------------------------- dust
  _buildDust() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 12; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({ size: 0.09, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x9ff6ff, opacity: 0.75 });
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this._dustPos = pos;
  }

  // ---------------------------------------------------------------- update
  update(dt, cameraPos, routeD) {
    this.t += dt;
    const t = this.t;
    for (const fn of this.animators) fn(dt, t);
    this.skyMat.uniforms.time.value = t;

    // zone blending for sky / fog / dust colour
    const zf = this._zoneFloat(routeD);
    const i0 = Math.floor(zf), i1 = Math.min(5, i0 + 1), k = zf - i0;
    this.skyMat.uniforms.top.value.copy(this.skyColors[i0][0]).lerp(this.skyColors[i1][0], k);
    this.skyMat.uniforms.bottom.value.copy(this.skyColors[i0][1]).lerp(this.skyColors[i1][1], k);
    this.scene.fog.color.copy(this.fogColors[i0]).lerp(this.fogColors[i1], k);
    this.dustMat.color.set(ZONES[i0].accent).lerp(new THREE.Color(ZONES[i1].accent), k).lerp(new THREE.Color(0xffffff), 0.4);
    this.scene.fog.density = i0 >= 5 ? 0.01 : 0.018;

    // storm flashes
    if (this._flash > 0) { this._flash -= dt; this.hemi.intensity = 0.9 + this._flash * 6; } else this.hemi.intensity = 0.9;

    // sky + shadow light follow the camera
    this.sky.position.copy(cameraPos);
    this.sun.position.copy(cameraPos).add(new THREE.Vector3(10, 22, 8));
    this.sun.target.position.copy(cameraPos).add(new THREE.Vector3(0, 0, -6));

    // dust drifts and wraps around the camera
    const p = this._dustPos;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] += dt * 0.25 * (0.5 + (i % 7) / 7);
      if (p[i + 1] > 12) p[i + 1] = 0;
      let dx = p[i] - cameraPos.x, dz = p[i + 2] - cameraPos.z;
      if (dx > 25) p[i] -= 50; else if (dx < -25) p[i] += 50;
      if (dz > 25) p[i + 2] -= 50; else if (dz < -25) p[i + 2] += 50;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  _zoneFloat(d) {
    const e = ROUTE.encounterAt;
    const bounds = [-1e9, e[0] + 10, e[1] + 10, e[2] + 10, e[3] + 10, e[4] + 14];
    for (let i = 0; i < 5; i++) {
      if (d < bounds[i + 1]) {
        const blend = 8;
        const k = THREE.MathUtils.clamp((d - (bounds[i + 1] - blend)) / blend, 0, 1);
        return i + k;
      }
    }
    return 5;
  }
}
