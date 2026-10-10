// Chop food: convex vegetable hulls, plane splitting and a procedural skin/flesh shader.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export const KINDS = {
  carrot: { id: 0, density: 1030, tick: 0.3 },
  cucumber: { id: 1, density: 960, tick: 0.16 },
  apple: { id: 2, density: 820, tick: 0.24 },
};

function ringX(out, x, r, n = 28) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(new THREE.Vector3(x, Math.cos(a) * r, Math.sin(a) * r));
  }
}

export function basePoints(kind) {
  const p = [];
  if (kind === 'carrot') {
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      ringX(p, -0.09 + t * 0.18, 0.0045 + 0.012 * Math.pow(t, 0.8));
    }
    ringX(p, -0.0925, 0.0028, 14);
    p.push(new THREE.Vector3(-0.0942, 0, 0));
  } else if (kind === 'cucumber') {
    const H = 0.075, C = 0.028, R = 0.021;
    for (let i = 0; i <= 8; i++) ringX(p, -H + (2 * H * i) / 8, R);
    for (const s of [-1, 1]) {
      for (let j = 1; j <= 5; j++) {
        const f = (j / 6) * Math.PI * 0.5;
        ringX(p, s * (H + C * Math.sin(f)), R * Math.cos(f), 24);
      }
      p.push(new THREE.Vector3(s * (H + C), 0, 0));
    }
  } else {
    const A = 0.038, B = 0.034;
    for (let i = 1; i < 14; i++) {
      const th = (i / 14) * Math.PI;
      const y = B * Math.cos(th), r = A * Math.sin(th);
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        p.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
    }
    p.push(new THREE.Vector3(0, B, 0), new THREE.Vector3(0, -B, 0));
  }
  return p;
}

export function basePlanes(kind) {
  return kind === 'carrot' ? [{ n: new THREE.Vector3(1, 0, 0), d: 0.09 }] : [];
}

export function buildHull(points, planes) {
  const geo = new ConvexGeometry(points);
  const pos = geo.attributes.position;
  const count = pos.count;
  if (count < 12) throw new Error('degenerate hull');
  const cut = new Float32Array(count);
  const keyToIndex = new Map();
  const pts = [];
  const idx = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;
    let j = keyToIndex.get(k);
    if (j === undefined) { j = pts.length; keyToIndex.set(k, j); pts.push(new THREE.Vector3(x, y, z)); }
    idx[i] = j;
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), cen = new THREE.Vector3();
  const faces = [];
  const faceKeys = new Set();
  const edgeKeys = new Set();
  const edges = [];
  const addEdge = (i, j) => {
    const lo = Math.min(i, j), hi = Math.max(i, j);
    const k = lo * 100000 + hi;
    if (lo !== hi && !edgeKeys.has(k)) { edgeKeys.add(k); edges.push(lo, hi); }
  };
  for (let t = 0; t < count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    addEdge(idx[t], idx[t + 1]); addEdge(idx[t + 1], idx[t + 2]); addEdge(idx[t + 2], idx[t]);
    e1.subVectors(b, a); e2.subVectors(c, a); fn.crossVectors(e1, e2);
    const len = fn.length();
    if (len < 1e-14) continue;
    fn.divideScalar(len);
    cen.copy(a).add(b).add(c).divideScalar(3);
    const d = fn.dot(cen);
    const fk = `${Math.round(fn.x * 400)},${Math.round(fn.y * 400)},${Math.round(fn.z * 400)},${Math.round(d * 1e4)}`;
    if (len > 1e-9 && !faceKeys.has(fk)) {
      let ok = true;
      for (const p of pts) if (fn.x * p.x + fn.y * p.y + fn.z * p.z - d > 2e-5) { ok = false; break; }
      if (ok) { faceKeys.add(fk); faces.push(fn.x, fn.y, fn.z, d); }
    }
    let isCut = 0;
    for (const p of planes) {
      if (fn.dot(p.n) > 0.995 && Math.abs(p.n.dot(cen) - p.d) < 3e-4) { isCut = 1; break; }
    }
    cut[t] = cut[t + 1] = cut[t + 2] = isCut;
  }
  geo.setAttribute('aCut', new THREE.BufferAttribute(cut, 1));
  const center = new THREE.Vector3();
  for (const p of pts) center.add(p);
  center.divideScalar(pts.length);
  let radius = 0;
  for (const p of pts) radius = Math.max(radius, p.distanceTo(center));
  const flat = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => p.toArray(flat, i * 3));
  return { geo, pts, flat, edges: Int32Array.from(edges), faces: Float32Array.from(faces), center, radius };
}

export function insideHull(faces, p, eps = -0.0004) {
  for (let i = 0; i < faces.length; i += 4) {
    if (faces[i] * p.x + faces[i + 1] * p.y + faces[i + 2] * p.z - faces[i + 3] > eps) return false;
  }
  return true;
}

export function splitHull(hull, n, d, minThick = 0.0025) {
  const { pts, edges } = hull;
  const eps = 1e-7;
  const dist = pts.map(p => n.dot(p) - d);
  const A = [], B = [];
  let maxA = 0, minB = 0;
  for (let i = 0; i < pts.length; i++) {
    const di = dist[i];
    if (di >= -eps) A.push(pts[i].clone());
    if (di <= eps) B.push(pts[i].clone());
    if (di > maxA) maxA = di;
    if (di < minB) minB = di;
  }
  if (maxA < minThick || -minB < minThick) return null;
  for (let k = 0; k < edges.length; k += 2) {
    const i = edges[k], j = edges[k + 1];
    const di = dist[i], dj = dist[j];
    if ((di > eps && dj < -eps) || (di < -eps && dj > eps)) {
      const p = pts[i].clone().lerp(pts[j], di / (di - dj));
      A.push(p);
      B.push(p.clone());
    }
  }
  return { A, B };
}

const GLSL_NOISE = /* glsl */`
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.07); }
`;

const GLSL_NORMAL = /* glsl */`
vec3 foodNormal(vec3 p) {
#if KIND == 0
  if (p.x < -0.088) return normalize(vec3(p.x + 0.086, p.y, p.z));
  return normalize(vec3(-0.075, normalize(p.yz + 1e-7)));
#elif KIND == 1
  float ax = abs(p.x);
  if (ax <= 0.075) return normalize(vec3(0.0, p.yz + 1e-7));
  return normalize(vec3(sign(p.x) * (ax - 0.075) / (0.028 * 0.028), p.y / (0.021 * 0.021), p.z / (0.021 * 0.021)));
#else
  return normalize(vec3(p.x / (0.038 * 0.038), p.y / (0.034 * 0.034), p.z / (0.038 * 0.038)));
#endif
}
`;

const GLSL_COLOR = /* glsl */`
vec3 foodColor(vec3 p, float cut, out float rough) {
#if KIND == 0
  float t = clamp((p.x + 0.09) / 0.18, 0.0, 1.0);
  float R = 0.0045 + 0.012 * pow(t, 0.8);
  if (cut > 0.5) {
    float r = length(p.yz) / R;
    float n = fbm(p * 900.0);
    vec3 c = mix(srgb(vec3(1.0, 0.74, 0.32)), srgb(vec3(1.0, 0.53, 0.11)), smoothstep(0.42, 0.56, r + (n - 0.5) * 0.1));
    float ang = atan(p.z, p.y);
    c *= 0.95 + 0.05 * sin(ang * 26.0 + n * 7.0) * smoothstep(0.5, 0.9, r);
    c = mix(c, srgb(vec3(0.86, 0.36, 0.05)), smoothstep(0.9, 1.0, r));
    rough = 0.4;
    return c;
  }
  float n = fbm(p * vec3(260.0, 700.0, 700.0));
  vec3 c = mix(srgb(vec3(0.9, 0.38, 0.05)), srgb(vec3(1.0, 0.52, 0.12)), n);
  float ring = smoothstep(0.9, 1.0, sin(p.x * 430.0 + fbm(p * 220.0) * 12.0)) * smoothstep(0.35, 0.7, fbm(p * vec3(60.0, 500.0, 500.0)));
  c *= 1.0 - ring * 0.18;
  rough = 0.62;
  return c;
#elif KIND == 1
  float ax = abs(p.x);
  float Rr = 0.021;
  if (ax > 0.075) { float s = clamp((ax - 0.075) / 0.028, 0.0, 1.0); Rr = 0.021 * sqrt(max(1.0 - s * s, 0.02)); }
  float ang = atan(p.z, p.y);
  if (cut > 0.5) {
    float r = length(p.yz) / Rr;
    float lobes = 0.5 + 0.5 * cos(ang * 3.0);
    float seedZone = 1.0 - smoothstep(0.5, 0.6, r / mix(0.86, 1.06, lobes));
    vec3 c = mix(srgb(vec3(0.68, 0.83, 0.42)), srgb(vec3(0.84, 0.91, 0.62)), seedZone);
    c *= 0.95 + 0.05 * fbm(p * 700.0);
    float a3 = mod(ang + 1.0472, 2.0944) - 1.0472;
    vec2 q = vec2(r * cos(a3), r * sin(a3));
    float s1 = length((q - vec2(0.36, 0.12)) * vec2(1.0, 2.2));
    float s2 = length((q - vec2(0.36, -0.12)) * vec2(1.0, 2.2));
    c = mix(c, srgb(vec3(0.98, 0.98, 0.88)), (1.0 - smoothstep(0.06, 0.085, min(s1, s2))) * 0.85);
    c = mix(c, srgb(vec3(0.16, 0.36, 0.1)), smoothstep(0.88, 0.97, r));
    rough = 0.32;
    return c;
  }
  float stripe = smoothstep(0.55, 1.0, sin(ang * 10.0 + fbm(p * vec3(40.0, 260.0, 260.0)) * 5.0)) * fbm(p * vec3(30.0, 200.0, 200.0));
  vec3 c = mix(srgb(vec3(0.07, 0.17, 0.04)), srgb(vec3(0.13, 0.27, 0.07)), fbm(p * 180.0));
  c = mix(c, srgb(vec3(0.33, 0.47, 0.17)), stripe * 0.45);
  float wart = smoothstep(0.8, 0.92, vnoise(p * 900.0));
  c = mix(c, srgb(vec3(0.58, 0.68, 0.38)), wart * 0.55);
  rough = 0.34;
  return c;
#else
  vec3 e = p / vec3(0.038, 0.034, 0.038);
  float r = length(e);
  if (cut > 0.5) {
    vec3 c = srgb(vec3(0.98, 0.93, 0.74));
    float axisD = length(p.xz);
    float core = 1.0 - smoothstep(0.009, 0.016, axisD + abs(p.y) * 0.35);
    c = mix(c, srgb(vec3(0.93, 0.9, 0.62)), core * 0.8);
    float ang = atan(p.z, p.x);
    float star = abs(axisD - (0.011 + 0.003 * cos(ang * 5.0)));
    c = mix(c, srgb(vec3(0.84, 0.8, 0.52)), (1.0 - smoothstep(0.0, 0.0012, star)) * step(abs(p.y), 0.016));
    float seed = length(vec2(axisD - 0.0065, p.y * 0.55));
    c = mix(c, srgb(vec3(0.35, 0.2, 0.08)), (1.0 - smoothstep(0.0022, 0.003, seed)) * step(abs(p.y), 0.01));
    c = mix(c, srgb(vec3(0.75, 0.12, 0.08)), smoothstep(0.965, 0.995, r));
    c *= 0.97 + 0.03 * fbm(p * 800.0);
    rough = 0.5;
    return c;
  }
  float n = fbm(p * vec3(90.0, 40.0, 90.0));
  float streak = fbm(vec3(atan(p.z, p.x) * 6.0, p.y * 40.0, 0.0));
  vec3 c = mix(srgb(vec3(0.55, 0.03, 0.04)), srgb(vec3(0.78, 0.12, 0.06)), n);
  c = mix(c, srgb(vec3(0.9, 0.65, 0.22)), smoothstep(0.55, 0.85, streak) * smoothstep(-0.02, 0.03, -p.y) * 0.6);
  c = mix(c, srgb(vec3(0.95, 0.8, 0.45)), smoothstep(0.86, 0.9, vnoise(p * 1400.0)) * 0.5);
  rough = 0.3;
  return c;
#endif
}
`;

const materials = {};

export function foodMaterial(kind) {
  if (materials[kind]) return materials[kind];
  const id = KINDS[kind].id;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 });
  m.defines = { KIND: id };
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aCut;
varying vec3 vObj;
varying float vCut;
${GLSL_NORMAL}`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = aCut > 0.5 ? vec3(normal) : foodNormal(position);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vObj = position;
vCut = aCut;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
varying float vCut;
${GLSL_NOISE}
${GLSL_COLOR}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float foodRough = 0.5;
diffuseColor.rgb = foodColor(vObj, vCut, foodRough);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = foodRough;`);
  };
  m.customProgramCacheKey = () => `food${id}`;
  materials[kind] = m;
  return m;
}
