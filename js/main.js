// Chop: slice vegetables on the TV with an iPhone held like a knife (ARKit pose via the local relay).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import RAPIER from 'rapier';
import { KINDS, basePoints, basePlanes, buildHull, splitHull, insideHull, foodMaterial } from './food.js';
import { Knife, PhoneMapper } from './knife.js';
import { Net } from './net.js';
import { Sfx } from './audio.js';

await RAPIER.init();

const BOARD = { w: 0.4, d: 0.26, h: 0.025 };
const BOARD_TOP = BOARD.h;
const HOVER = new THREE.Vector3(0, BOARD_TOP + 0.09, 0.07);
const CAL_POINT = new THREE.Vector3(0, BOARD_TOP, 0.07);

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c1916);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 10);
camera.position.set(-0.17, 0.27, 0.33);
camera.lookAt(0.025, 0.018, -0.03);

const sun = new THREE.DirectionalLight(0xfff1de, 2.4);
sun.position.set(0.28, 0.75, 0.32);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -0.34, right: 0.34, top: 0.34, bottom: -0.34, near: 0.2, far: 2 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.0015;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xf3e6d6, 0x2a221b, 0.55));

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const woodTex = canvasTexture(1024, 640, (g, w, h) => {
  const strips = 9;
  for (let s = 0; s < strips; s++) {
    g.fillStyle = `hsl(${27 + Math.random() * 7}, ${42 + Math.random() * 12}%, ${50 + Math.random() * 9}%)`;
    g.fillRect(0, (s * h) / strips, w, h / strips + 1);
  }
  for (let i = 0; i < 1100; i++) {
    const y = Math.random() * h;
    g.strokeStyle = `rgba(92,52,22,${0.03 + Math.random() * 0.09})`;
    g.lineWidth = 0.5 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    const ph = Math.random() * 10;
    for (let x = 0; x <= w; x += 48) g.lineTo(x, y + Math.sin(x * 0.005 + ph) * 3 + (Math.random() - 0.5) * 1.4);
    g.stroke();
  }
  for (let s = 1; s < strips; s++) {
    g.fillStyle = 'rgba(70,40,18,0.35)';
    g.fillRect(0, (s * h) / strips - 1, w, 2);
  }
  for (let i = 0; i < 160; i++) {
    const x = w * 0.15 + Math.random() * w * 0.7, y = h * 0.15 + Math.random() * h * 0.7;
    const a = Math.PI / 2 + (Math.random() - 0.5) * 0.5, l = 10 + Math.random() * 50;
    g.strokeStyle = `rgba(255,236,210,${0.05 + Math.random() * 0.08})`;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
});

const stoneTex = canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#34312d';
  g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22 + (Math.random() < 0.012 ? 40 : 0);
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}, [6, 2]);

const tileTex = canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#4a453f';
  g.fillRect(0, 0, w, h);
  const rows = 8, cols = 2;
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c < cols + 1; c++) {
      const off = r % 2 ? w / cols / 2 : 0;
      const x = c * (w / cols) + off, y = r * (h / rows);
      const l = 52 + Math.random() * 5;
      g.fillStyle = `hsl(32, 14%, ${l}%)`;
      g.fillRect(x + 3, y + 3, w / cols - 6, h / rows - 6);
    }
  }
}, [8, 4]);

const board = new THREE.Mesh(
  new RoundedBoxGeometry(BOARD.w, BOARD.h, BOARD.d, 4, 0.006),
  new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.72 })
);
board.position.y = BOARD.h / 2;
board.castShadow = board.receiveShadow = true;
scene.add(board);

const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 1.1), new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.55 }));
counter.position.set(0, -0.02, 0.2);
counter.receiveShadow = true;
scene.add(counter);

const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.35 }));
wall.position.set(0, 0.75, -0.35);
wall.receiveShadow = true;
scene.add(wall);

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 120;
try { world.lengthUnit = 0.1; } catch {}
world.createCollider(RAPIER.ColliderDesc.cuboid(BOARD.w / 2, BOARD.h / 2, BOARD.d / 2).setTranslation(0, BOARD.h / 2, 0).setFriction(0.9));
world.createCollider(RAPIER.ColliderDesc.cuboid(1.5, 0.02, 0.55).setTranslation(0, -0.02, 0.2).setFriction(0.8));

const pieces = [];

function addPiece(kind, hull, planes, pos, quat) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.05)
      .setAngularDamping(0.5)
      .setCcdEnabled(true)
  );
  const cd = RAPIER.ColliderDesc.convexHull(hull.flat);
  if (!cd) {
    world.removeRigidBody(body);
    return null;
  }
  world.createCollider(cd.setDensity(KINDS[kind].density).setFriction(0.9).setRestitution(0.05), body);
  const mesh = new THREE.Mesh(hull.geo, foodMaterial(kind));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.position.copy(pos);
  mesh.quaternion.copy(quat);
  scene.add(mesh);
  const pc = { kind, hull, planes, body, mesh, cut: null };
  pieces.push(pc);
  return pc;
}

function removePiece(pc) {
  world.removeRigidBody(pc.body);
  scene.remove(pc.mesh);
  pc.hull.geo.dispose();
  pieces.splice(pieces.indexOf(pc), 1);
}

let currentKind = 'carrot';
function spawn(kind) {
  currentKind = kind;
  const planes = basePlanes(kind);
  const hull = buildHull(basePoints(kind), planes);
  const pos = new THREE.Vector3((Math.random() - 0.5) * 0.05, BOARD_TOP + (kind === 'apple' ? 0.042 : 0.026), -0.025 + (Math.random() - 0.5) * 0.03);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.3);
  addPiece(kind, hull, planes, pos, quat);
}

function clearBoard() {
  while (pieces.length) removePiece(pieces[0]);
}

const knife = new Knife(scene);
const phone = new PhoneMapper();
const sfx = new Sfx();
let phoneCount = 0, lastPose = -1e9, tracking = 0, calibrated = false, slices = 0;
const smooth = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), init: false };

const ui = {
  dot: document.querySelector('#conn .dot'),
  connText: document.getElementById('connText'),
  hint: document.getElementById('hint'),
  count: document.getElementById('slices'),
  big: document.getElementById('big'),
  sound: document.getElementById('sound'),
};

function showBig(text) {
  ui.big.textContent = text;
  ui.big.classList.toggle('on', !!text);
}

const net = new Net(msg => {
  if (msg.t === 'phones') phoneCount = msg.n;
  else if (msg.t === 'p') {
    phone.read(msg.m);
    tracking = msg.s;
    lastPose = performance.now();
    if (!phone.cal) phone.calibrate(HOVER);
  } else if (msg.t === 'cal') calibrateNow();
  else if (msg.t === 'count') showBig(msg.n > 0 ? String(msg.n) : '');
  else if (msg.t === 'spawn' && KINDS[msg.k]) spawn(msg.k);
  else if (msg.t === 'clear') {
    clearBoard();
    spawn(currentKind);
  }
});

function calibrateNow() {
  if (performance.now() - lastPose > 600) {
    showBig('');
    return;
  }
  phone.calibrate(CAL_POINT);
  smooth.init = false;
  calibrated = true;
  showBig('✓');
  setTimeout(() => showBig(''), 700);
  net.haptic(1, 0.5, true);
  net.send({ t: 'state', calibrated: true });
}

let countdownTimer = null;
function countdownCalibrate() {
  clearInterval(countdownTimer);
  let n = 3;
  showBig(String(n));
  countdownTimer = setInterval(() => {
    n--;
    if (n > 0) {
      showBig(String(n));
      net.haptic(0.5, 0.8, true);
    } else {
      clearInterval(countdownTimer);
      calibrateNow();
    }
  }, 800);
}

const mouse = { ndc: new THREE.Vector2(0, -0.3), down: false, yaw: 0, y: HOVER.y };
const raycaster = new THREE.Raycaster();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_TOP);
const mouseBase = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0))
);
canvas.addEventListener('pointermove', e => mouse.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
canvas.addEventListener('pointerdown', () => { mouse.down = true; });
addEventListener('pointerup', () => { mouse.down = false; });
canvas.addEventListener('wheel', e => { mouse.yaw -= e.deltaY * 0.002; }, { passive: true });

async function unlockSound() {
  await sfx.init();
  ui.sound.classList.add('off');
}
addEventListener('pointerdown', unlockSound, { once: true });
addEventListener('keydown', unlockSound, { once: true });

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === '1') spawn('carrot');
  else if (k === '2') spawn('cucumber');
  else if (k === '3') spawn('apple');
  else if (k === 'r') { clearBoard(); spawn(currentKind); }
  else if (k === 'c') countdownCalibrate();
  else if (k === 'q') mouse.yaw += 0.15;
  else if (k === 'e') mouse.yaw -= 0.15;
});

function floorAt(x, z) {
  return Math.abs(x) <= BOARD.w / 2 && Math.abs(z) <= BOARD.d / 2 ? BOARD_TOP : 0;
}

const tmpT = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), invQ = new THREE.Quaternion();
const loc = new THREE.Vector3(), sub = new THREE.Vector3(), wc = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function pieceFrame(pc) {
  const t = pc.body.translation(), r = pc.body.rotation();
  tmpT.set(t.x, t.y, t.z);
  tmpQ.set(r.x, r.y, r.z, r.w);
  invQ.copy(tmpQ).invert();
}

function insideWorld(pc, p) {
  loc.copy(p).sub(tmpT).applyQuaternion(invQ);
  return insideHull(pc.hull.faces, loc);
}

function worldMinY(pc) {
  let m = Infinity;
  for (const p of pc.hull.pts) m = Math.min(m, loc.copy(p).applyQuaternion(tmpQ).y + tmpT.y);
  return m;
}

function nearestSampleY(c) {
  let best = Infinity, y = Infinity;
  for (const s of knife.samples) {
    const d = (s.x - c.x) ** 2 + (s.z - c.z) ** 2;
    if (d < best) { best = d; y = s.y; }
  }
  return y;
}

function startCut(pc, cen) {
  pc.cut = { n0: knife.normal.clone(), n1: knife.normal.clone(), c: cen.clone(), minY: worldMinY(pc), lastY: cen.y };
  pc.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  net.haptic(0.4, 0.6, true);
}

function endCut(pc) {
  pc.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  pc.cut = null;
}

function slice(pc, strength) {
  pieceFrame(pc);
  const n = pc.cut.n0.clone();
  const n1 = pc.cut.n1.clone();
  if (n.dot(n1) < 0) n1.negate();
  n.add(n1);
  n.y *= 0.5;
  n.normalize();
  const nL = n.clone().applyQuaternion(invQ).normalize();
  const d = nL.dot(pc.cut.c.clone().sub(tmpT).applyQuaternion(invQ));
  const planesA = [...pc.planes, { n: nL.clone().negate(), d: -d }];
  const planesB = [...pc.planes, { n: nL.clone(), d }];
  const sp = splitHull(pc.hull, nL, d);
  let hA = null, hB = null;
  if (sp) {
    try {
      hA = buildHull(sp.A, planesA);
      hB = buildHull(sp.B, planesB);
    } catch { hA = null; }
  }
  if (!hA || !hB) {
    endCut(pc);
    return false;
  }
  const T = tmpT.clone(), Q = tmpQ.clone(), kind = pc.kind;
  removePiece(pc);
  const a = addPiece(kind, hA, planesA, T, Q);
  const b = addPiece(kind, hB, planesB, T, Q);
  if (a && b) {
    const ma = a.body.mass(), mb = b.body.mass(), tot = ma + mb;
    const v = 0.12;
    a.body.setLinvel({ x: n.x * v * mb / tot, y: 0.02, z: n.z * v * mb / tot }, true);
    b.body.setLinvel({ x: -n.x * v * ma / tot, y: 0.02, z: -n.z * v * ma / tot }, true);
    const small = ma < mb ? a : b;
    const side = small === a ? n.clone() : n.clone().negate();
    const w = UP.clone().cross(side).multiplyScalar(4.5);
    small.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
  }
  slices++;
  ui.count.textContent = slices;
  sfx.cut(kind, strength);
  net.haptic(1, 0.5, true);
  return true;
}

function cutting(speed) {
  let sliced = false;
  const S = knife.samples, P = knife.prevSamples;
  for (const pc of pieces.slice()) {
    pieceFrame(pc);
    wc.copy(pc.hull.center).applyQuaternion(tmpQ).add(tmpT);
    const r2 = (pc.hull.radius + 0.01) ** 2;
    let near = false;
    for (let i = 0; i < S.length; i++) {
      if (S[i].distanceToSquared(wc) < r2 || P[i].distanceToSquared(wc) < r2) { near = true; break; }
    }
    if (!near && !pc.cut) continue;
    let count = 0, swept = 0;
    const cen = new THREE.Vector3(), scen = new THREE.Vector3();
    if (near) {
      for (let i = 0; i < S.length; i++) {
        if (insideWorld(pc, S[i])) { count++; cen.add(S[i]); continue; }
        const dist = S[i].distanceTo(P[i]);
        if (dist > 0.003) {
          const steps = Math.min(12, Math.ceil(dist / 0.003));
          for (let k = 1; k < steps; k++) {
            sub.lerpVectors(P[i], S[i], k / steps);
            if (insideWorld(pc, sub)) { swept++; scen.add(sub); break; }
          }
        }
      }
    }
    if (count > 0) {
      cen.divideScalar(count);
      if (!pc.cut) startCut(pc, cen);
      pc.cut.n1.copy(knife.normal);
      pc.cut.c.copy(cen);
      if (pc.cut.lastY - cen.y > 0.003) {
        pc.cut.lastY = cen.y;
        net.haptic(KINDS[pc.kind].tick, 0.85);
      }
    } else if (pc.cut || swept > 0) {
      const c = pc.cut ? pc.cut.c : scen.divideScalar(swept);
      const minY = pc.cut ? pc.cut.minY : worldMinY(pc);
      if (nearestSampleY(c) < minY + 0.0025) {
        if (!pc.cut) pc.cut = { n0: knife.normal.clone(), n1: knife.normal.clone(), c: c.clone(), minY, lastY: c.y };
        if (slice(pc, speed)) sliced = true;
      } else if (pc.cut) endCut(pc);
    }
  }
  return sliced;
}

let wasClamped = false, prevMinY = 0;
function boardContact(dt, sliced) {
  const v = (prevMinY - knife.unclampedMinY) / dt;
  prevMinY = knife.unclampedMinY;
  if (knife.clamped && !wasClamped && !sliced) {
    const s = Math.min(1, Math.max(0, v) / 0.8);
    if (s > 0.05) {
      sfx.knock(s);
      net.haptic(0.25 + 0.6 * s, 0.35, true);
    }
  }
  wasClamped = knife.clamped;
  return Math.min(1, Math.max(0, v) / 0.8);
}

function updateMouse(dt) {
  raycaster.setFromCamera(mouse.ndc, camera);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(boardPlane, p)) p.set(0, 0, 0.05);
  p.x = THREE.MathUtils.clamp(p.x, -0.26, 0.26);
  p.z = THREE.MathUtils.clamp(p.z, -0.16, 0.2);
  mouse.y = THREE.MathUtils.clamp(mouse.y + (mouse.down ? -0.6 : 0.8) * dt, BOARD_TOP - 0.01, HOVER.y);
  p.y = mouse.y;
  const q = new THREE.Quaternion().setFromAxisAngle(UP, mouse.yaw).multiply(mouseBase);
  knife.placeEdgeCenter(p, q);
}

function updateHud(now) {
  const live = now - lastPose < 600;
  let state = 'none', text = 'Telefon: brak · steruj myszką';
  if (live && tracking >= 2) { state = 'ok'; text = 'Telefon: śledzenie OK'; }
  else if (live) { state = 'warn'; text = 'Telefon: rusz nim powoli, ARKit łapie pokój'; }
  else if (phoneCount > 0) { state = 'warn'; text = 'Telefon połączony, czekam na ruch'; }
  if (ui.dot.dataset.state !== state) ui.dot.dataset.state = state;
  if (ui.connText.textContent !== text) ui.connText.textContent = text;
  const hint = live && !calibrated ? 'Trzymaj telefon jak nóż, oprzyj pięść o stół i naciśnij Kalibruj na telefonie' : '';
  if (ui.hint.textContent !== hint) {
    ui.hint.textContent = hint;
    ui.hint.classList.toggle('on', !!hint);
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

spawn('carrot');

let last = performance.now(), acc = 0, prevEdgeY = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  tick(dt, now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function tick(dt, now) {
  if (now - lastPose < 600) {
    phone.map();
    if (!smooth.init) {
      smooth.pos.copy(phone.outPos);
      smooth.quat.copy(phone.outQuat);
      smooth.init = true;
    } else {
      smooth.pos.lerp(phone.outPos, 0.7);
      smooth.quat.slerp(phone.outQuat, 0.7);
    }
    knife.setPose(smooth.pos, smooth.quat);
  } else {
    smooth.init = false;
    updateMouse(dt);
  }
  knife.finalize(floorAt);
  const edgeY = knife.unclampedMinY;
  const speed = Math.min(1, Math.max(0, (prevEdgeY - edgeY) / dt) / 0.8);
  prevEdgeY = edgeY;
  const sliced = cutting(speed);
  boardContact(dt, sliced);

  acc += dt;
  let steps = 0;
  while (acc >= world.timestep && steps < 6) {
    world.step();
    acc -= world.timestep;
    steps++;
  }
  if (steps === 6) acc = 0;
  for (const pc of pieces.slice()) {
    const t = pc.body.translation(), r = pc.body.rotation();
    if (t.y < -0.4) { removePiece(pc); continue; }
    pc.mesh.position.set(t.x, t.y, t.z);
    pc.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
  updateHud(now);
}
requestAnimationFrame(frame);

window.chop = { pieces, spawn, clearBoard, knife, mouse, phone, world, calibrateNow, camera, tick, render: () => renderer.render(scene, camera) };
