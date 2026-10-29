// The gigantic electronic royal hall with the golden throne (final scene).
import * as THREE from 'three';
import { ROUTE } from '../config.js';
import { std, metal, gold, glowUnique, shadowAll } from './materials.js';
import { pcbTexture } from './textures.js';

export function buildThroneHall(world) {
  const group = new THREE.Group();
  const d = ROUTE.throneAt;
  const f = world.frame(d);
  // Hall local space: +Z points from the throne toward the entrance (back along the route).
  group.position.copy(f.pos);
  group.rotation.y = Math.atan2(-f.tangent.x, -f.tangent.z);

  const goldM = std(0xc8962e, { metalness: 0.85, roughness: 0.4 });
  const darkGold = std(0x8a6a1e, { metalness: 0.9, roughness: 0.35 });
  const marble = std(0x1a1420, { metalness: 0.3, roughness: 0.25 });

  // floor: polished dark board with gold traces
  const tex = pcbTexture({ base: '#1b130a', trace: '#ffcf5a', seed: 777, glow: '#ffcf5a' });
  const map = tex.map.clone(); map.needsUpdate = true; map.repeat.set(4, 6);
  const em = tex.emissiveMap.clone(); em.needsUpdate = true; em.repeat.set(4, 6);
  const floorMat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffb43a, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 46), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.025, 17); floor.receiveShadow = true;
  group.add(floor);

  // red carpet with gold trim
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 34), std(0x8e0f22, { roughness: 0.9 }));
  carpet.position.set(0, 0.05, 21); carpet.receiveShadow = true; group.add(carpet);
  for (const s of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 34), goldM);
    trim.position.set(s * 1.6, 0.055, 21); group.add(trim);
  }

  // elevated platform with stairs
  const platform = new THREE.Group();
  const levels = [[9, 7, 0.35], [7.5, 5.6, 0.35], [6, 4.2, 0.35]];
  let y = 0;
  levels.forEach(([w, dep, h], i) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), i % 2 ? marble : darkGold);
    step.position.set(0, y + h / 2, -dep / 2 + 3.5 - i * 0.7);
    step.castShadow = step.receiveShadow = true;
    platform.add(step);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.05, 0.05), glowUnique(0xffd36a, 2.5));
    edge.position.set(0, y + h, 3.5 - i * 0.7);
    platform.add(edge);
    y += h;
  });
  const platformTop = y;
  group.add(platform);

  // ---- the throne ----
  const throne = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 1.7), goldM);
  seat.position.y = 0.75; throne.add(seat);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 1.45), std(0xa3122a, { roughness: 0.8 }));
  cushion.position.set(0, 1.02, 0.05); throne.add(cushion);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.9), darkGold);
  base.position.y = 0.3; throne.add(base);
  // backrest shaped like a giant chip with a crown top
  const backShape = new THREE.Shape();
  backShape.moveTo(-1.1, 0); backShape.lineTo(1.1, 0); backShape.lineTo(1.1, 2.6);
  backShape.lineTo(0.8, 3.3); backShape.lineTo(0.45, 2.8); backShape.lineTo(0, 3.7);
  backShape.lineTo(-0.45, 2.8); backShape.lineTo(-0.8, 3.3); backShape.lineTo(-1.1, 2.6); backShape.lineTo(-1.1, 0);
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(backShape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }), goldM);
  back.position.set(0, 0.9, -0.85); throne.add(back);
  const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.9), new THREE.MeshStandardMaterial({ color: 0x8e0f22, roughness: 0.7 }));
  backPanel.position.set(0, 2.2, -0.42); throne.add(backPanel);
  // gems
  const gemColors = [0x3cf2ff, 0xff3355, 0x7cff6b, 0xb06bff, 0xff9a1a];
  gemColors.forEach((c, i) => {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), glowUnique(c, 3));
    gem.position.set(-0.8 + i * 0.4, 3.35 + (i === 2 ? 0.45 : 0), -0.4); throne.add(gem);
  });
  // armrests with pin headers
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.6), goldM);
    arm.position.set(s * 1.2, 1.35, 0); throne.add(arm);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), darkGold);
    post.position.set(s * 1.2, 1.0, 0.65); throne.add(post);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glowUnique(0xffd36a, 2));
    orb.position.set(s * 1.2, 1.6, 0.7); throne.add(orb);
  }
  shadowAll(throne);
  throne.position.set(0, platformTop, 0);
  group.add(throne);

  // ---- pillars ----
  const pillarMat = std(0x2a1d0c, { metalness: 0.7, roughness: 0.3 });
  const pillarLights = [];
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 12, 16), pillarMat);
      shaft.position.y = 6; p.add(shaft);
      for (const yy of [0.3, 11.7]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.8), goldM); cap.position.y = yy; p.add(cap);
      }
      // glowing gold circuit stripe
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 10, 16, 1, true, 0, 0.5), glowUnique(0xffc23a, 1.8));
      stripe.position.y = 6; stripe.rotation.y = s > 0 ? Math.PI : 0; p.add(stripe);
      const torch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), glowUnique(0xffd36a, 4));
      torch.position.set(-s * 0.9, 5, 0); p.add(torch);
      p.position.set(s * 9, 0, 2 + i * 6.5);
      shadowAll(p);
      group.add(p);
      pillarLights.push(torch);
    }
  }
  // back wall with mural (no roof — the electronic sky is visible)
  const wallTex = pcbTexture({ base: '#22160a', trace: '#ffcf5a', seed: 4242, glow: '#ffcf5a', density: 1.4 });
  const wm = wallTex.map.clone(); wm.needsUpdate = true; wm.repeat.set(3, 1.5);
  const we = wallTex.emissiveMap.clone(); we.needsUpdate = true; we.repeat.set(3, 1.5);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 0.6), new THREE.MeshStandardMaterial({ map: wm, emissiveMap: we, emissive: 0xffb43a, emissiveIntensity: 0.12, metalness: 0.3, roughness: 0.6, color: 0x9a8a70 }));
  wall.position.set(0, 8, -5); wall.receiveShadow = true; group.add(wall);
  // giant crown emblem on the wall
  const crownShape = new THREE.Shape();
  crownShape.moveTo(-3, 0); crownShape.lineTo(3, 0); crownShape.lineTo(3.4, 3); crownShape.lineTo(1.8, 1.6);
  crownShape.lineTo(0, 3.8); crownShape.lineTo(-1.8, 1.6); crownShape.lineTo(-3.4, 3); crownShape.lineTo(-3, 0);
  const crown = new THREE.Mesh(new THREE.ExtrudeGeometry(crownShape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1 }), glowUnique(0xffc23a, 1.2));
  crown.position.set(0, 9.5, -4.6); group.add(crown);
  crown.userData.dynamic = true;
  // side walls
  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14, 46), std(0x170f06, { metalness: 0.5, roughness: 0.5 }));
    sw.position.set(s * 15, 7, 18); sw.receiveShadow = true; group.add(sw);
  }
  // entrance arch
  const arch = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.6, 12, 40, Math.PI), goldM);
  arch.position.set(0, 0, 40); shadowAll(arch); group.add(arch);

  // ---- lights ----
  const throneLight = new THREE.SpotLight(0xffd88a, 0, 40, Math.PI / 7, 0.4, 1.2);
  throneLight.position.set(0, 16, 8);
  throneLight.target.position.set(0, platformTop + 1.5, 0);
  throneLight.castShadow = true;
  throneLight.shadow.mapSize.set(1024, 1024);
  group.add(throneLight, throneLight.target);
  const hallFill = new THREE.PointLight(0xffb84a, 0, 40, 1.2);
  hallFill.position.set(0, 9, 14);
  group.add(hallFill);
  const rimLights = [];
  for (const s of [-1, 1]) {
    const l = new THREE.PointLight(0xffa31a, 0, 18, 1.5);
    l.position.set(s * 6, 4, 2); group.add(l); rimLights.push(l);
  }

  // positions (world space) for the cinematic
  const toWorld = (x, yy, z) => group.localToWorld(new THREE.Vector3(x, yy, z));
  group.updateMatrixWorld(true);
  const api = {
    group,
    platformTop,
    seatLocal: new THREE.Vector3(0, platformTop + 1.1, 0.1),
    seatWorld: () => toWorld(0, platformTop + 1.1, 0.1),
    throneFrontWorld: () => toWorld(0, platformTop, 2.0),
    toWorld,
    /** Kneeling spots for the five enemies, in a line facing the throne. */
    enemySpotLocal: (i) => new THREE.Vector3(-6 + i * 3, 0, 8.6),
    entranceLocal: new THREE.Vector3(0, 0, 36),
    celebrating: false,
    lit: 0,
    setLit(k) {
      api.lit = k;
      throneLight.intensity = 28 * k;
      hallFill.intensity = 18 * k + 6;
      rimLights.forEach(l => l.intensity = 8 * k);
    },
    update(dt, t) {
      floorMat.emissiveIntensity = 0.25 + 0.12 * Math.sin(t * 1.5);
      pillarLights.forEach((m, i) => { m.material.emissiveIntensity = 3 + Math.sin(t * 6 + i) * 0.8; });
      crown.material.emissiveIntensity = 1 + (api.celebrating ? 1.5 + Math.sin(t * 4) : 0.2);
      crown.rotation.z = Math.sin(t * 0.8) * 0.02;
    },
  };
  api.setLit(0.15);
  return api;
}
