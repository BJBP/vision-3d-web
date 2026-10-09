// Camera-space coordinates arrive mirrored. Hands do not depend on a valid torso.
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export class HandInput {
  constructor() {
    this.reset();
  }
  reset() {
    this.points = [];
    this.time = -Infinity;
    this.serial = 0;
  }
  sample(pose, hands, time) {
    const wrist = i =>
      pose?.i?.length === 66 && pose?.v?.[i] > 0.65 && Number.isFinite(pose.i[i * 2] + pose.i[i * 2 + 1])
        ? { x: pose.i[i * 2], y: pose.i[i * 2 + 1], side: i }
        : null;
    const wrists = [wrist(15), wrist(16)].filter(p => p && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
    const shoulderWidth = pose?.v?.[11] > 0.6 && pose?.v?.[12] > 0.6 ? Math.abs(pose.i?.[22] - pose.i?.[24]) : 0;
    const found = [];
    for (const h of Array.isArray(hands) ? hands : []) {
      if (!Array.isArray(h?.lm) || h.lm.length !== 42 || !h.lm.every(Number.isFinite)) continue;
      const at = i => ({ x: h.lm[i * 2], y: h.lm[i * 2 + 1] });
      const palm = at(9),
        base = at(0),
        width = distance(at(5), at(17));
      if (palm.x < 0 || palm.x > 1 || palm.y < 0 || palm.y > 1 || width < 0.006 || width > 0.4) continue;
      const near = wrists.toSorted((a, b) => distance(a, base) - distance(b, base))[0];
      found.push({
        ...palm,
        side: near && distance(near, base) < 0.18 ? near.side : null,
        pinch: distance(at(4), at(8)) / width,
        scale: clamp(shoulderWidth || width * 5, 0.07, 0.45),
        source: 'fingers',
      });
      if (found.length === 2) break;
    }
    // Wrist fallback also works if the finger model misses a small/distant hand.
    for (const w of wrists) {
      if (
        found.length < 2 &&
        !found.some(p => p.side === w.side || (p.source === 'fingers' && p.side === null && distance(p, w) < 0.1))
      )
        found.push({ ...w, pinch: 2, scale: clamp(shoulderWidth || 0.24, 0.07, 0.45), source: 'wrist' });
    }
    // Preserve matching through a slow render. The 300 ms freshness gate in
    // current() remains strict, and an explicit empty detection clears IDs.
    const previous = time - this.time < 750 ? this.points : [];
    const available = [...previous],
      dt = clamp((time - this.time) / 1000, 0.001, 0.15),
      k = 1 - Math.exp(-dt * 24);
    this.points = found.map(p => {
      let old = available.find(q => q.side !== null && q.side === p.side);
      if (!old) old = available.toSorted((a, b) => distance(a, p) - distance(b, p))[0];
      if (old && distance(old, p) > 0.35) old = null;
      if (old) available.splice(available.indexOf(old), 1);
      const x = old ? old.x + (p.x - old.x) * k : p.x,
        y = old ? old.y + (p.y - old.y) * k : p.y;
      const pinched = p.source === 'fingers' && p.pinch < (old?.pinched ? 0.6 : 0.38);
      return {
        ...p,
        x,
        y,
        id: old?.id ?? ++this.serial,
        observedAt: time,
        pinched,
        pressed: pinched && !old?.pinched,
        sx: clamp((x - 0.12) / 0.76, 0.02, 0.98),
        sy: clamp((y - 0.08) / 0.84, 0.02, 0.98),
      };
    });
    this.time = time;
    return this.points;
  }
  current(now) {
    return now - this.time < 300 ? this.points : [];
  }
}

// Continuous two-hand charge. Missing data cancels it; reconnecting cannot fire.
export class EnergyGesture {
  constructor() {
    this.bursts = 0;
    this.cooldown = 0;
    this.reset();
  }
  reset() {
    this.phase = 'idle';
    this.charge = 0;
    this.previous = -Infinity;
    this.pair = '';
  }
  update(points, now) {
    const dt = clamp((now - this.previous) / 1000, 0, 0.1),
      gap = now - this.previous;
    this.previous = now;
    if (points.length !== 2) {
      this.phase = 'idle';
      this.charge = 0;
      this.pair = '';
      return this.state(false);
    }
    const pair = points
      .map(p => p.id)
      .sort()
      .join(':');
    const freshCapture = points.every(p => Number.isFinite(p.observedAt) && now - p.observedAt < 300);
    if (pair !== this.pair || (gap > 350 && !freshCapture)) {
      this.charge = 0;
      this.phase = 'idle';
      this.pair = pair;
    }
    const span = distance(points[0], points[1]) / ((points[0].scale + points[1].scale) / 2 || 0.24);
    if (now < this.cooldown) return this.state(false);
    if (span < 0.8) {
      this.charge = clamp(this.charge + dt / 0.65);
      this.phase = this.charge === 1 ? 'holding' : 'charging';
    } else if (this.charge < 1) {
      this.charge = Math.max(0, this.charge - dt * 3);
      this.phase = this.charge ? 'charging' : 'idle';
    }
    if (this.charge === 1 && span > 1.8) {
      this.bursts++;
      this.cooldown = now + 1300;
      this.phase = 'idle';
      this.charge = 0;
      return this.state(true);
    }
    return this.state(false);
  }
  state(released = false) {
    return { phase: this.phase, charge: this.charge, bursts: this.bursts, released };
  }
}
