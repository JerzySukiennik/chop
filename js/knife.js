// Chop knife: chef's knife mesh in iPhone-local space and ARKit pose -> board space mapping.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PHONE = { halfWidth: 0.0378, halfLength: 0.0755 };
const EDGE_Y = -(PHONE.halfWidth + 0.012);
const SPINE_Y = 0.006;
const HEEL_X = 0.03;
const STRAIGHT_X = -0.085;
const TIP_X = -0.148;
const TIP_Y = EDGE_Y + 0.024;
export const EDGE_CENTER = new THREE.Vector3(-0.03, EDGE_Y, 0);

function edgeY(x) {
  if (x >= STRAIGHT_X) return EDGE_Y;
  const u = (x - STRAIGHT_X) / (TIP_X - STRAIGHT_X);
  return EDGE_Y + u * u * (TIP_Y - EDGE_Y);
}

export class Knife {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const s = new THREE.Shape();
    s.moveTo(HEEL_X, SPINE_Y);
    s.lineTo(HEEL_X, EDGE_Y + 0.002);
    for (let i = 0; i <= 24; i++) {
      const x = HEEL_X - 0.002 + (TIP_X - HEEL_X + 0.002) * (i / 24);
      s.lineTo(x, edgeY(x));
    }
    s.quadraticCurveTo(-0.128, SPINE_Y - 0.004, -0.1, SPINE_Y);
    s.lineTo(HEEL_X, SPINE_Y);
    const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.0014, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0005, bevelSegments: 2, curveSegments: 16 });
    bladeGeo.translate(0, 0, -0.0007);
    const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.18 });
    const blade = new THREE.Mesh(bladeGeo, steel);

    const bolster = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.02, 0.011, 2, 0.002), steel);
    bolster.position.set(HEEL_X + 0.006, 0.0, 0);

    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1b1918, roughness: 0.45, metalness: 0 });
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.115, 0.024, 0.017, 4, 0.006), handleMat);
    handle.position.set(HEEL_X + 0.012 + 0.0575, -0.001, 0);

    const rivetGeo = new THREE.CylinderGeometry(0.0026, 0.0026, 0.0176, 16);
    rivetGeo.rotateX(Math.PI / 2);
    for (const x of [0.06, 0.1, 0.14]) {
      const r = new THREE.Mesh(rivetGeo, steel);
      r.position.set(x, -0.001, 0);
      this.group.add(r);
    }
    for (const m of [blade, bolster, handle]) {
      m.castShadow = true;
      this.group.add(m);
    }

    this.localSamples = [];
    for (let i = 0; i < 26; i++) {
      const x = HEEL_X - 0.003 + (TIP_X + 0.006 - HEEL_X + 0.003) * (i / 25);
      this.localSamples.push(new THREE.Vector3(x, edgeY(x), 0));
    }
    this.samples = this.localSamples.map(v => v.clone());
    this.prevSamples = this.samples.map(v => v.clone());
    this.normal = new THREE.Vector3(0, 0, 1);
    this.tipDir = new THREE.Vector3(-1, 0, 0);
    this.clamped = false;
    this.unclampedMinY = 0;
  }

  setPose(position, quaternion) {
    this.group.position.copy(position);
    this.group.quaternion.copy(quaternion);
  }

  placeEdgeCenter(point, quaternion) {
    this.group.quaternion.copy(quaternion);
    this.group.position.copy(point).sub(EDGE_CENTER.clone().applyQuaternion(quaternion));
  }

  finalize(floorAt) {
    for (let i = 0; i < this.samples.length; i++) this.prevSamples[i].copy(this.samples[i]);
    this.group.updateMatrixWorld(true);
    let minY = Infinity, lift = 0;
    const w = new THREE.Vector3();
    for (const v of this.localSamples) {
      w.copy(v).applyMatrix4(this.group.matrixWorld);
      minY = Math.min(minY, w.y);
      lift = Math.max(lift, floorAt(w.x, w.z) - w.y);
    }
    this.unclampedMinY = minY;
    this.clamped = lift > 0;
    if (this.clamped) {
      this.group.position.y += lift;
      this.group.updateMatrixWorld(true);
    }
    for (let i = 0; i < this.localSamples.length; i++) this.samples[i].copy(this.localSamples[i]).applyMatrix4(this.group.matrixWorld);
    this.normal.set(0, 0, 1).applyQuaternion(this.group.quaternion);
    this.tipDir.set(-1, 0, 0).applyQuaternion(this.group.quaternion);
  }
}

export class PhoneMapper {
  constructor() {
    this.side = -1;
    this.cal = null;
    this.flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    this.P = new THREE.Vector3();
    this.Q = new THREE.Quaternion();
    this.K = new THREE.Quaternion();
    this.M = new THREE.Matrix4();
    this.S = new THREE.Vector3();
    this.outPos = new THREE.Vector3();
    this.outQuat = new THREE.Quaternion();
  }

  read(m) {
    this.M.fromArray(m);
    this.M.decompose(this.P, this.Q, this.S);
    const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.Q).y;
    if (this.side * upY > 0.3) this.side = -this.side;
    this.K.copy(this.Q);
    if (this.side === 1) this.K.multiply(this.flip);
  }

  edgeReal() {
    return EDGE_CENTER.clone().applyQuaternion(this.K).add(this.P);
  }

  calibrate(target) {
    const f = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.K);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const R = new THREE.Quaternion().setFromUnitVectors(f, new THREE.Vector3(0, 0, -1));
    this.cal = { R, E0: this.edgeReal(), O: target.clone() };
  }

  map() {
    const { R, E0, O } = this.cal;
    this.outPos.copy(this.P).sub(E0).applyQuaternion(R).add(O);
    this.outQuat.copy(R).multiply(this.K);
  }
}
