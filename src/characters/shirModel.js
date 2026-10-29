// Full-body model of Shir, revealed only in the final throne cinematic.
import * as THREE from 'three';
import { EnemyRig } from '../enemies/rig.js';
import { CartoonFace } from '../enemies/face.js';

export function buildShir() {
  const rig = new EnemyRig({
    hipHeight: 0.92, hipWidth: 0.11, legUpper: 0.44, legLower: 0.42, legThick: 0.06, footSize: 0.2,
    shoulderY: 0.56, shoulderX: 0.24, armUpper: 0.3, armLower: 0.28, armThick: 0.045, fistSize: 0.085,
    limbColor: 0xc98d6a, jointColor: 0xc98d6a, fistColor: 0x1f5fe0, footColor: 0xf5f5f5, fistStyle: 'glove',
  });
  // the rig's own +X is Shir's left side → LEFT glove blue, RIGHT glove red (same as first-person)
  const redGlove = rig.mat(0xe0202c, { roughness: 0.35 });
  rig.arms.R.fist.traverse(o => { if (o.isMesh && o.material === rig.fistM) o.material = redGlove; });

  const skin = rig.limbM;
  const torso = new THREE.Group();
  // shorts
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.26, 20), rig.mat(0xc8102e, { roughness: 0.6 }));
  shorts.position.y = 0.0; torso.add(shorts);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.06, 20), rig.mat(0xf2c14e, { metalness: 1, roughness: 0.25 }));
  belt.position.y = 0.12; torso.add(belt);
  // championship belt buckle
  const buckle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20), rig.mat(0xf2c14e, { metalness: 1, roughness: 0.2, emissive: 0x6a4a00, emissiveIntensity: 0.6 }));
  buckle.rotation.x = Math.PI / 2; buckle.position.set(0, 0.12, 0.2); torso.add(buckle);
  // chest (tank top)
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.28, 8, 20), rig.mat(0x15151d, { roughness: 0.7 }));
  chest.scale.set(1.2, 1, 0.8); chest.position.y = 0.38; torso.add(chest);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), rig.mat(0xf2c14e, { metalness: 1, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.8 }));
  emblem.position.set(0, 0.42, 0.147); torso.add(emblem);
  // neck + head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 12), skin);
  neck.position.y = 0.66; torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.83; torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 28, 20), skin);
  skull.scale.set(1, 1.1, 1); head.add(skull);
  // hair: dark spiky crown of cones
  const hairM = rig.mat(0x1d140d, { roughness: 0.8 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2.1), hairM);
  cap.position.y = 0.02; cap.rotation.x = -0.15; head.add(cap);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 6), hairM);
    spike.position.set(Math.cos(a) * 0.09, 0.12, Math.sin(a) * 0.09 - 0.02);
    spike.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    head.add(spike);
  }
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin);
    ear.position.set(s * 0.14, 0, 0); head.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin);
  nose.position.set(0, -0.02, 0.14); head.add(nose);
  const face = new CartoonFace({ eyeSize: 0.032, eyeSpacing: 0.055, eyeY: 0.02, mouthWidth: 0.07, mouthY: -0.07, lidColor: 0xb57d5c, browColor: 0x1d140d, pupilColor: 0x3a2412 });
  face.group.position.set(0, 0.0, 0.125);
  head.add(face.group);
  rig.registerMaterials(face.materials);
  face.setExpression('happy');
  // royal crown (hidden until the coronation moment)
  const crown = new THREE.Group();
  const goldM = rig.mat(0xf2c14e, { metalness: 1, roughness: 0.2, emissive: 0x5a3a00, emissiveIntensity: 0.6 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.07, 24, 1, true), goldM);
  crown.add(band);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pt = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), goldM);
    pt.position.set(Math.cos(a) * 0.125, 0.07, Math.sin(a) * 0.125); crown.add(pt);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.016), rig.mat([0x3cf2ff, 0xff3355, 0x7cff6b][i % 3], { emissive: [0x3cf2ff, 0xff3355, 0x7cff6b][i % 3], emissiveIntensity: 3 }));
    gem.position.set(Math.cos(a) * 0.13, 0.12, Math.sin(a) * 0.13); crown.add(gem);
  }
  crown.position.y = 0.16;
  crown.visible = false;
  head.add(crown);
  // royal cape
  const capeGeo = new THREE.PlaneGeometry(0.62, 1.05, 8, 12);
  const pos = capeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, -Math.abs(x) * 0.25 - (0.5 - y) * 0.08 + Math.sin(x * 9) * 0.015);
    pos.setX(i, x * (1 + (0.5 - y) * 0.5));
  }
  capeGeo.computeVertexNormals();
  const cape = new THREE.Mesh(capeGeo, rig.mat(0x9e0f2a, { side: THREE.DoubleSide, roughness: 0.7 }));
  cape.position.set(0, 0.1, -0.17); torso.add(cape);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 24, Math.PI), rig.mat(0xf6f1e6, { roughness: 0.9 }));
  collar.position.set(0, 0.62, -0.03); collar.rotation.set(Math.PI / 2, 0, Math.PI); torso.add(collar);

  rig.torso.add(torso);
  rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });

  return {
    rig, face, crown, head, cape,
    /** Seated royal pose. cheer: 0..1 raises both fists. */
    pose(t, cheer = 0, wave = 0) {
      const T = rig.guard();
      rig.stiffness = 6;
      T.legL.hip = -1.45; T.legR.hip = -1.45; T.legL.knee = 1.5; T.legR.knee = 1.5;
      T.legL.hipZ = 0.15; T.legR.hipZ = -0.15;
      T.crouch = 0.42;
      T.lean = -0.08;
      // arms resting on the armrests → raised fists of victory
      const up = cheer;
      T.armL.sh = -0.5 * (1 - up) - 2.9 * up + Math.sin(t * 6) * 0.15 * up;
      T.armR.sh = -0.5 * (1 - up) - 2.9 * up + Math.cos(t * 6) * 0.15 * up;
      T.armL.shZ = 0.35 * (1 - up) + 0.45 * up; T.armR.shZ = -0.35 * (1 - up) - 0.45 * up;
      T.armL.el = -1.2 * (1 - up) - 0.25 * up; T.armR.el = -1.2 * (1 - up) - 0.25 * up;
      if (wave > 0) { T.armR.sh = -2.4; T.armR.el = -0.9 + Math.sin(t * 9) * 0.4; T.armR.shZ = -0.5; }
      T.bounce = 0;
      head.rotation.y = Math.sin(t * 0.7) * 0.15;
      cape.rotation.x = Math.sin(t * 1.3) * 0.03;
    },
  };
}
