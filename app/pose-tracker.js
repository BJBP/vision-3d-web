// Seguimiento del esqueleto: filtra pose y manos (One Euro), arma los 21 puntos de cada mano y
// calcula articulaciones virtuales (cabeza, cuello, centros). Escribe en target/vis; follow() lleva J/V.
import * as THREE from 'three';
import { HAND_A, HAND_B, MID_S, MID_H, HEAD, NECK, JOINTS } from '../modules/avatar/index.js';
import { OneEuro, validPose, validHand } from '../modules/tracking/index.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createPoseTracker({ J, V, U, scale: S }) {
  const filt = Array.from({ length: 33 * 3 }, () => new OneEuro());
  const target = Array.from({ length: JOINTS }, () => new THREE.Vector3(0, -20, 0)); // destino ya filtrado
  const vis = new Array(JOINTS).fill(0);
  const offF = [new OneEuro(0.8, 0.3), new OneEuro(0.8, 0.3), new OneEuro(0.5, 0.2)];
  const handSeen = [-1e9, -1e9];
  const handFilters = Array.from({ length: 126 }, () => new OneEuro(2.1, 0.4));
  const tmp = new THREE.Vector3(),
    tmp2 = new THREE.Vector3();
  // Estado leído por app.js: última pose aceptada, distancia al torso (OAK-D) y motivo de seguimiento.
  const state = { lastPose: -1e9, torsoDist: null, issue: 'searching' };
  let poseCount = 0;

  function reset() {
    [...filt, ...offF, ...handFilters].forEach(f => f.reset());
    handSeen.fill(-1e9);
    vis.fill(0);
    state.torsoDist = null;
    state.issue = 'searching';
    poseCount = 0;
  }

  // MediaPipe: x a la derecha de la imagen, y hacia abajo, z negativo hacia la cámara → escena espejada
  const conv = (arr, k, out) => out.set(-arr[k] * S, -arr[k + 1] * S, -arr[k + 2] * S);

  function ingestPose(pose, hands, dt) {
    const { w, i: img, v } = pose;
    if (!validPose(pose)) return;
    if (performance.now() - state.lastPose > 1500) reset();
    poseCount++;
    // posición global: horizontal y vertical desde la imagen, profundidad real desde la OAK-D
    const hx = (img[46] + img[48]) / 2,
      hy = (img[47] + img[49]) / 2;
    if (Number.isFinite(pose.d) && pose.d > 0.2 && pose.d < 8) state.torsoDist = pose.d;
    const ox = offF[0].filter((hx - 0.5) * 7.5, dt);
    const oy = offF[1].filter((0.55 - hy) * 6.0 + 0.1, dt);
    const oz = offF[2].filter(state.torsoDist ? clamp((2.6 - state.torsoDist) * 1.3, -1.5, 1.8) : 0, dt);
    for (let j = 0; j < 33; j++) {
      const confidence = v[j] ?? 0;
      vis[j] += (confidence - vis[j]) * (1 - Math.exp(-dt * 12));
      if (confidence < 0.35 && poseCount > 1) continue;
      conv(w, j * 3, tmp);
      target[j].set(
        filt[j * 3].filter(tmp.x + ox, dt),
        filt[j * 3 + 1].filter(tmp.y + oy, dt),
        filt[j * 3 + 2].filter(tmp.z + oz, dt),
      );
    }
    // manos: cada mano detectada se une a la muñeca de la pose más cercana en la imagen
    const now = performance.now();
    const assigned = new Set();
    for (const h of Array.isArray(hands) ? hands : []) {
      if (!validHand(h)) continue;
      const dA = Math.hypot(h.lm[0] - img[30], h.lm[1] - img[31]),
        dB = Math.hypot(h.lm[0] - img[32], h.lm[1] - img[33]);
      if (Math.min(dA, dB) > 0.12) continue;
      const side = dA < dB ? 0 : 1;
      if (assigned.has(side)) continue;
      assigned.add(side);
      if (now - handSeen[side] > 300) handFilters.slice(side * 63, side * 63 + 63).forEach(f => f.reset());
      const wrist = target[side ? 16 : 15],
        base = side ? HAND_B : HAND_A;
      conv(h.wl, 0, tmp2);
      for (let j = 0; j < 21; j++) {
        conv(h.wl, j * 3, tmp);
        tmp.sub(tmp2);
        const k = side * 63 + j * 3;
        target[base + j].set(
          wrist.x + handFilters[k].filter(tmp.x, dt),
          wrist.y + handFilters[k + 1].filter(tmp.y, dt),
          wrist.z + handFilters[k + 2].filter(tmp.z, dt),
        );
      }
      handSeen[side] = now;
    }
    for (const side of [0, 1]) {
      if (now - handSeen[side] > 160) pseudoHand(side);
      else if (!assigned.has(side)) {
        const base = side ? HAND_B : HAND_A;
        tmp.copy(target[side ? 16 : 15]).sub(target[base]);
        for (let j = 0; j < 21; j++) target[base + j].add(tmp);
      }
    }
    for (const side of [0, 1]) for (let j = 0; j < 21; j++) vis[(side ? HAND_B : HAND_A) + j] = vis[side ? 16 : 15];
    state.lastPose = now;
  }

  // sin detección de dedos: mano aproximada con los puntos de muñeca, índice, meñique y pulgar de la pose
  function pseudoHand(side) {
    const [w, p, i, t] = side ? [16, 18, 20, 22] : [15, 17, 19, 21];
    const W = target[w],
      P = target[p],
      I = target[i],
      T = target[t],
      base = side ? HAND_B : HAND_A;
    const f = new THREE.Vector3().copy(I).add(P).multiplyScalar(0.5).sub(W).normalize();
    target[base].copy(W);
    const knuckles = { 5: I, 9: I.clone().lerp(P, 0.33), 13: I.clone().lerp(P, 0.66), 17: P };
    for (const k of [5, 9, 13, 17]) {
      target[base + k].copy(knuckles[k]);
      const len = (k === 9 ? 0.034 : k === 17 ? 0.024 : 0.03) * S;
      for (let s = 1; s <= 3; s++)
        target[base + k + s].copy(target[base + k + s - 1]).addScaledVector(f, len * (1.1 - s * 0.15));
    }
    const td = new THREE.Vector3().copy(T).sub(W);
    target[base + 1].copy(W).addScaledVector(td, 0.35);
    target[base + 2].copy(W).addScaledVector(td, 0.7);
    target[base + 3].copy(T);
    target[base + 4].copy(T).addScaledVector(td.normalize(), 0.03 * S);
  }

  function updateVirtualJoints() {
    J[MID_S].copy(J[11]).add(J[12]).multiplyScalar(0.5);
    J[MID_H].copy(J[23]).add(J[24]).multiplyScalar(0.5);
    const ears = tmp.copy(J[7]).add(J[8]).multiplyScalar(0.5);
    const up = tmp2.copy(ears).sub(J[MID_S]).normalize();
    const headR = clamp(J[7].distanceTo(J[8]) * 0.56, 0.08 * S, 0.115 * S);
    J[HEAD].copy(ears)
      .lerp(J[0], 0.25)
      .addScaledVector(up, 0.015 * S);
    J[NECK].copy(J[HEAD]).addScaledVector(up, -headR * 0.95);
    U.uHeadR.value += (headR - U.uHeadR.value) * 0.2;
    J[79].copy(J[MID_H]).lerp(J[MID_S], 0.5);
    V[79] = Math.min(V[11], V[12], V[23], V[24]);
    V[MID_S] = Math.min(V[11], V[12]);
    V[MID_H] = Math.min(V[23], V[24]);
    V[HEAD] = V[NECK] = V[0];
  }

  // Vista previa estática (sin visitante): coloca una pose neutra sin tocar lastPose ni el estado.
  function setNeutral(pose) {
    for (let j = 0; j < 33; j++) {
      conv(pose.w, j * 3, target[j]);
      vis[j] = 0.99;
    }
    pseudoHand(0);
    pseudoHand(1);
    for (let j = 33; j < 75; j++) vis[j] = 0.99;
  }

  // El esqueleto visible (J, V) se interpola hacia el destino filtrado entre mensajes de la cámara.
  function follow(k) {
    for (let j = 0; j < 75; j++) {
      J[j].lerp(target[j], k);
      V[j] += (vis[j] - V[j]) * k;
    }
  }

  return Object.assign(state, { handSeen, reset, ingest: ingestPose, setNeutral, follow, updateVirtualJoints });
}
