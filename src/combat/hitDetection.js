// Hit detection: sweeps the punch path — from the glove tip forward along the
// punch direction (Shir leans/steps into the punch) — against the enemy's hurt
// spheres at the moment of impact. Anything that moved out of the path (a dodge)
// is missed.
import * as THREE from 'three';

const GLOVE_RADIUS = 0.11;
const LUNGE_REACH = 0.9;  // metres the punch path extends beyond the visible glove tip

const _seg = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * @param {THREE.Vector3} tip   glove tip (world)
 * @param {THREE.Vector3} dir   normalised punch direction (world)
 * @param {import('../enemies/enemy.js').Enemy} enemy
 * @returns {{hit:boolean, point?:THREE.Vector3, normal?:THREE.Vector3, distance:number}}
 */
export function testPunch(tip, dir, enemy, reach = LUNGE_REACH) {
  if (!enemy || !enemy.alive) return { hit: false, distance: Infinity };
  let best = { hit: false, distance: Infinity };
  _seg.copy(dir).multiplyScalar(reach);
  for (const s of enemy.hurtSpheres()) {
    // closest point on the segment [tip, tip + seg] to the sphere centre
    const t = THREE.MathUtils.clamp(_tmp.subVectors(s.center, tip).dot(_seg) / _seg.lengthSq(), 0, 1);
    const closest = tip.clone().addScaledVector(_seg, t);
    const d = closest.distanceTo(s.center);
    if (d < best.distance) best.distance = d;
    if (d <= s.radius + GLOVE_RADIUS) {
      const n = new THREE.Vector3().subVectors(closest, s.center);
      if (n.lengthSq() < 1e-6) n.copy(dir).multiplyScalar(-1);
      n.normalize();
      // contact point: where the path enters the sphere, on the side facing Shir
      const toward = dir.clone().multiplyScalar(-1);
      const point = s.center.clone().addScaledVector(n.lerp(toward, 0.6).normalize(), s.radius * 0.85);
      if (!best.hit || d < best.d) best = { hit: true, point, normal: n, distance: d, d };
    }
  }
  return best;
}
