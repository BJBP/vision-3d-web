// Stabilizes observed joints independently from their display completion.
// Missing joints hold for one second, then return to a neutral body at the retained anchor.
import { assessBodyFrame, demoPose, validPose } from './tracking.js';

const parents = [
  null,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  23,
  24,
  11,
  12,
  13,
  14,
  15,
  16,
  15,
  16,
  15,
  16,
  null,
  23,
  23,
  24,
  25,
  26,
  27,
  28,
  27,
  28,
];
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const distance = (a, j, b, k) => Math.hypot(...[0, 1, 2].map(c => a[j * 3 + c] - b[k * 3 + c]));
const heading = pose => Math.atan2(pose.w[36 + 2] - pose.w[33 + 2], pose.w[36] - pose.w[33]);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createPoseStability() {
  const neutral = demoPose(0, true).w;
  const observed = neutral.slice();
  const output = { w: neutral.slice(), v: Array(33).fill(0.99), root: [0, 0, 0] };
  const seen = Array(33).fill(-Infinity);
  const confidence = Array(33).fill(0);
  const spine = [0, -1, 0];
  const earDirection = [1, 0, 0];
  const headUp = [0, -1, 0];
  let headSeen = -Infinity;
  let earWidth = 0;
  const accepted = Array(33).fill(false);
  let showMissingParts = true;
  let torsoSeen = -Infinity;
  let yaw = 0;
  let torsoLength = 0;
  let neutralOnly = true;
  const neutralHeading = heading({ w: neutral });

  function reset() {
    seen.fill(-Infinity);
    confidence.fill(0);
    accepted.fill(false);
    observed.splice(0, 99, ...neutral);
    output.root.fill(0);
    torsoSeen = -Infinity;
    headSeen = -Infinity;
    earWidth = 0;
    yaw = torsoLength = 0;
    spine.splice(0, 3, 0, -1, 0);
    neutralOnly = true;
  }

  function torso(pose, now) {
    const assessment = assessBodyFrame(pose);
    if (!assessment.ok) {
      if (assessment.reason === 'uncertain' && [11, 12, 23, 24].every(j => pose.v[j] >= 0.6)) return 'rejected';
      return 'partial';
    }
    const x = (pose.i[46] + pose.i[48]) / 2;
    const y = (pose.i[47] + pose.i[49]) / 2;
    const root = [
      (x - 0.5) * 7.5,
      (0.55 - y) * 6 + 0.1,
      Number.isFinite(pose.d) && pose.d > 0.2 && pose.d < 8 ? clamp((2.6 - pose.d) * 1.3, -1.5, 1.8) : output.root[2],
    ];
    const nextYaw = angleDelta(heading(pose), neutralHeading);
    const up = [0, 1, 2].map(c => (pose.w[33 + c] + pose.w[36 + c] - pose.w[69 + c] - pose.w[72 + c]) / 2);
    const length = Math.hypot(...up);
    const elapsed = Math.max(0.001, (now - torsoSeen) / 1000);
    if (
      Number.isFinite(torsoSeen) &&
      (Math.abs(angleDelta(nextYaw, yaw)) > Math.min(1.2, 0.45 + elapsed * 4) ||
        Math.hypot(root[0] - output.root[0], root[1] - output.root[1]) > 0.35 + Math.min(elapsed, 0.3) * 4 ||
        Math.abs(root[2] - output.root[2]) > 0.35 + Math.min(elapsed, 0.3) * 2 ||
        up.reduce((dot, value, axis) => dot + (value * spine[axis]) / length, 0) < 0.5 ||
        length / torsoLength < 0.65 ||
        length / torsoLength > 1.5)
    )
      return 'rejected';
    output.root.splice(0, 3, ...root);
    yaw = nextYaw;
    torsoLength = length;
    for (let axis = 0; axis < 3; axis++) spine[axis] = up[axis] / length;
    torsoSeen = now;
    return 'tracked';
  }

  function stableHead(pose, now, status) {
    if (
      [0, 7, 8].some(
        j =>
          pose.v[j] < 0.6 || pose.i[j * 2] < 0 || pose.i[j * 2] > 1 || pose.i[j * 2 + 1] < 0 || pose.i[j * 2 + 1] > 1,
      )
    )
      return false;
    const across = [0, 1, 2].map(c => pose.w[24 + c] - pose.w[21 + c]);
    const shoulders = status === 'tracked' ? pose.w : observed;
    const up = [0, 1, 2].map(c => (pose.w[21 + c] + pose.w[24 + c] - shoulders[33 + c] - shoulders[36 + c]) / 2);
    const width = Math.hypot(...across),
      height = Math.hypot(...up);
    if (
      width < 0.045 ||
      width > 0.3 ||
      height < 0.08 ||
      height > 0.42 ||
      Math.abs(across.reduce((dot, value, axis) => dot + value * up[axis], 0) / (width * height)) > 0.75
    )
      return false;
    const elapsed = Math.max(0.001, (now - headSeen) / 1000);
    if (
      Number.isFinite(headSeen) &&
      (width / earWidth < 0.5 ||
        width / earWidth > 1.8 ||
        across.reduce((dot, value, axis) => dot + (value * earDirection[axis]) / width, 0) <
          Math.cos(Math.min(1.15, 0.35 + elapsed * 3)) ||
        up.reduce((dot, value, axis) => dot + (value * headUp[axis]) / height, 0) < 0.5 ||
        [0, 7, 8].some(j => distance(pose.w, j, observed, j) > 0.12 + Math.min(elapsed, 0.5) * 3))
    )
      return false;
    for (let axis = 0; axis < 3; axis++) {
      earDirection[axis] = across[axis] / width;
      headUp[axis] = up[axis] / height;
    }
    earWidth = width;
    headSeen = now;
    return true;
  }

  function ingest(pose, now) {
    accepted.fill(false);
    if (!validPose(pose)) return { accepted, reliable: false };
    const status = torso(pose, now);
    if (status === 'rejected' || !Number.isFinite(torsoSeen)) return { accepted, reliable: false };
    const headReliable = stableHead(pose, now, status);
    let reliable = false;
    for (let j = 0; j < 33; j++) {
      if (j < 11 && !headReliable) continue;
      if (pose.v[j] < 0.35 || pose.i[j * 2] < 0 || pose.i[j * 2] > 1 || pose.i[j * 2 + 1] < 0 || pose.i[j * 2 + 1] > 1)
        continue;
      if (status === 'partial' && [11, 12, 23, 24].includes(j)) continue;
      const parent = parents[j];
      if (parent !== null) {
        const length = distance(pose.w, j, pose.w, parent);
        const restLength = distance(neutral, j, neutral, parent);
        if (length > restLength * 2 + 0.12 || length < restLength * 0.2 - 0.015) continue;
      }
      if (Math.hypot(...pose.w.slice(j * 3, j * 3 + 3)) > 1.8) continue;
      if (
        Number.isFinite(seen[j]) &&
        distance(pose.w, j, observed, j) > 0.12 + Math.min((now - seen[j]) / 1000, 0.5) * 3
      )
        continue;
      for (let c = 0; c < 3; c++) observed[j * 3 + c] = pose.w[j * 3 + c];
      seen[j] = now;
      confidence[j] = pose.v[j];
      accepted[j] = true;
      reliable = true;
    }
    if (reliable) neutralOnly = false;
    return { accepted, reliable, anchored: status === 'tracked' };
  }

  function sample(now) {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let j = 0; j < 33; j++) {
      const age = now - seen[j];
      const blend = neutralOnly ? 1 : clamp((age - 1000) / 1000, 0, 1);
      const x = neutral[j * 3],
        z = neutral[j * 3 + 2];
      output.w[j * 3] = observed[j * 3] * (1 - blend) + (x * c - z * s) * blend;
      output.w[j * 3 + 1] = observed[j * 3 + 1] * (1 - blend) + neutral[j * 3 + 1] * blend;
      output.w[j * 3 + 2] = observed[j * 3 + 2] * (1 - blend) + (x * s + z * c) * blend;
      output.v[j] = showMissingParts ? 0.99 : neutralOnly ? 0.99 : confidence[j] * (1 - clamp(age / 1000, 0, 1));
    }
    return output;
  }

  function setNeutral(pose) {
    reset();
    observed.splice(0, 99, ...pose.w);
  }

  return {
    ingest,
    sample,
    reset,
    setNeutral,
    configure: options => {
      showMissingParts = options.showMissingParts !== false;
    },
  };
}
