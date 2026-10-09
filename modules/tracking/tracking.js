// 1€ filter, Casiez et al. (CHI 2012). The derivative uses consecutive RAW samples.
export class OneEuro {
  constructor(minCut = 1.5, beta = 0.32, dCut = 1) {
    Object.assign(this, { minCut, beta, dCut });
    this.reset();
  }
  reset() {
    this.x = null;
    this.raw = null;
    this.dx = 0;
  }
  static a(cut, dt) {
    return 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  }
  filter(value, dt) {
    if (!Number.isFinite(value)) return this.x ?? 0;
    if (this.x === null) {
      this.x = this.raw = value;
      return value;
    }
    dt = Math.max(0.001, Math.min(0.2, dt));
    this.dx += OneEuro.a(this.dCut, dt) * ((value - this.raw) / dt - this.dx);
    this.raw = value;
    this.x += OneEuro.a(this.minCut + this.beta * Math.abs(this.dx), dt) * (value - this.x);
    return this.x;
  }
}

const finiteArray = (value, n) => Array.isArray(value) && value.length === n && value.every(Number.isFinite);
export function validPose(pose) {
  return (
    !!pose &&
    finiteArray(pose.w, 99) &&
    finiteArray(pose.i, 66) &&
    finiteArray(pose.v, 33) &&
    pose.w.every(v => Math.abs(v) < 5) &&
    pose.v.every(v => v >= 0 && v <= 1)
  );
}
export function validHand(hand) {
  return !!hand && finiteArray(hand.wl, 63) && finiteArray(hand.lm, 42) && hand.wl.every(v => Math.abs(v) < 1);
}

// PoseLandmarker may confidently detect a face while inventing hips below the
// image. Those extrapolated points must never anchor or rotate the whole avatar.
export function assessBodyFrame(pose) {
  if (!validPose(pose)) return { ok: false, reason: 'invalid' };
  const core = [11, 12, 23, 24];
  if (
    core.some(j => pose.i[j * 2] < 0.02 || pose.i[j * 2] > 0.98 || pose.i[j * 2 + 1] < 0.02 || pose.i[j * 2 + 1] > 0.98)
  )
    return { ok: false, reason: 'framing' };
  if (core.some(j => pose.v[j] < 0.6)) return { ok: false, reason: 'uncertain' };
  const midpoint = (a, b, k) => (pose.w[a * 3 + k] + pose.w[b * 3 + k]) / 2;
  const up = [0, 1, 2].map(k => midpoint(11, 12, k) - midpoint(23, 24, k));
  const length = Math.hypot(...up),
    width = Math.hypot(...[0, 1, 2].map(k => pose.w[11 * 3 + k] - pose.w[12 * 3 + k]));
  if (length < 0.18 || length > 0.85 || width < 0.12 || width > 0.75) return { ok: false, reason: 'uncertain' };
  // Reject a degenerate torso basis (shoulders nearly parallel to the spine).
  const across = [0, 1, 2].map(k => pose.w[11 * 3 + k] - pose.w[12 * 3 + k]);
  if (Math.abs(across.reduce((s, v, k) => s + v * up[k], 0) / (width * length)) > 0.85)
    return { ok: false, reason: 'uncertain' };
  return { ok: true, reason: 'tracked' };
}

// Deterministic rehearsal data. This is always identified as DEMO in the interface.
export function demoPose(t = 0, reduced = false) {
  const p = Array.from({ length: 33 }, () => [0, 0, 0]);
  const clock = reduced ? 0 : t;
  const breath = Math.sin(clock * 1.6) * 0.004;
  const turn = Math.sin(clock * 0.34) * 0.11;
  const put = (i, x, y, z = 0) => {
    p[i] = [x, y, z];
  };
  put(0, 0, 0.728 + breath, 0.115);
  for (const [a, b, x] of [
    [1, 4, 0.026],
    [2, 5, 0.034],
    [3, 6, 0.046],
  ]) {
    put(a, x, 0.767 + breath, 0.077);
    put(b, -x, 0.767 + breath, 0.077);
  }
  put(7, 0.083, 0.738 + breath, 0);
  put(8, -0.083, 0.738 + breath, 0);
  put(9, 0.025, 0.685 + breath, 0.089);
  put(10, -0.025, 0.685 + breath, 0.089);
  put(11, 0.192, 0.514 + breath);
  put(12, -0.192, 0.514 + breath);
  const wave = reduced ? 0.45 : 0.5 + 0.5 * Math.sin(clock * 0.46 - 1);
  put(13, 0.282, 0.24 + breath, 0.025);
  put(15, 0.317, 0.24 + breath - 0.241 * Math.cos(wave * 2.5), 0.025 + 0.241 * Math.sin(wave * 2.5));
  put(14, -0.29, 0.245 + breath, -0.012);
  put(16, -0.325, -0.015, 0.042);
  put(23, 0.092, 0);
  put(24, -0.092, 0);
  put(25, 0.1, -0.42, 0.015);
  put(26, -0.108, -0.42, -0.008);
  put(27, 0.115, -0.82, 0);
  put(28, -0.12, -0.82, -0.005);
  put(29, 0.115, -0.865, -0.035);
  put(30, -0.12, -0.865, -0.035);
  put(31, 0.12, -0.865, 0.145);
  put(32, -0.13, -0.865, 0.145);
  for (const [w, pinky, index, thumb, side] of [
    [15, 17, 19, 21, 1],
    [16, 18, 20, 22, -1],
  ]) {
    const [x, y, z] = p[w];
    const raised = w === 15 ? wave : 0;
    put(index, x - side * 0.025, y - 0.075 + raised * 0.13, z + 0.018);
    put(pinky, x + side * 0.026, y - 0.069 + raised * 0.12, z + 0.01);
    put(thumb, x - side * 0.041, y - 0.034 + raised * 0.085, z + 0.038);
  }
  const c = Math.cos(turn),
    s = Math.sin(turn);
  const w = p.flatMap(([x, y, z]) => [-(x * c + z * s), -y, -(-x * s + z * c)]);
  const i = p.flatMap(([x, y]) => [0.5 + x * 0.34, 0.565 - y * 0.47]);
  return { w, i, v: Array(33).fill(0.99), d: 2.6 };
}
