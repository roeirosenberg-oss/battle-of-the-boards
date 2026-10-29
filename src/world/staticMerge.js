// Merges static meshes that share a material into large chunked meshes.
// Cuts the world's draw calls dramatically. Objects flagged
// `userData.dynamic = true` (and everything below them) are left untouched,
// as are instanced meshes and multi-material meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CHUNK = 40; // metres along -Z per chunk (keeps frustum culling useful)

export function mergeStatic(root) {
  const buckets = new Map();
  const victims = [];
  let before = 0;

  const visit = (obj, dynamic) => {
    const dyn = dynamic || obj.userData.dynamic === true;
    if (obj.isMesh) before++;
    if (!dyn && obj.isMesh && !obj.isInstancedMesh && !obj.isSkinnedMesh && !Array.isArray(obj.material) && obj.geometry?.attributes?.position) {
      const g = obj.geometry;
      if (g.attributes.normal && g.attributes.uv && !g.morphAttributes?.position) {
        const wp = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
        const chunk = Math.floor(-wp.z / CHUNK);
        const key = `${obj.material.uuid}|${chunk}|${obj.castShadow ? 1 : 0}${obj.receiveShadow ? 1 : 0}|${obj.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, { material: obj.material, cast: obj.castShadow, receive: obj.receiveShadow, renderOrder: obj.renderOrder, geos: [] });
        let geo = g.index ? g.toNonIndexed() : g.clone();
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        for (const name of ['position', 'normal', 'uv']) {
          const at = geo.attributes[name];
          if (at.isInterleavedBufferAttribute || !(at.array instanceof Float32Array) || at.normalized) {
            const arr = new Float32Array(at.count * at.itemSize);
            for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) arr[i * at.itemSize + k] = at.getComponent ? at.getComponent(i, k) : at.array[i * at.itemSize + k];
            geo.setAttribute(name, new THREE.BufferAttribute(arr, at.itemSize));
          }
        }
        geo.applyMatrix4(obj.matrixWorld);
        buckets.get(key).geos.push(geo);
        victims.push(obj);
      }
    }
    for (const c of obj.children) visit(c, dyn);
  };
  visit(root, false);

  // the root's own transform is identity in this game; merged geometry is in world space
  for (const v of victims) v.parent?.remove(v);
  let after = 0;
  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    // strip draw groups so differently-built geometries can always be merged
    for (const g of b.geos) g.clearGroups();
    let merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) {
      // could not merge (attribute mismatch) — keep every piece as its own mesh
      for (const g of b.geos) {
        const m = new THREE.Mesh(g, b.material);
        m.castShadow = b.cast; m.receiveShadow = b.receive; m.renderOrder = b.renderOrder;
        root.add(m); after++;
      }
      continue;
    }
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive; m.renderOrder = b.renderOrder;
    m.matrixAutoUpdate = false;
    root.add(m);
    after++;
    for (const g of b.geos) if (g !== merged) g.dispose();
  }
  return { meshesBefore: before, merged: victims.length, mergedInto: after };
}
