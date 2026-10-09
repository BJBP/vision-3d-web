// Camera input can arrive several times between rendered frames. Consume each
// observation once; this dispatcher never advances timers or confirms actions.
export class HandIngress {
  constructor(consume) {
    this.consume = consume;
    this.key = null;
    this.latest = -Infinity;
  }
  push(hands, now, { enabled = true, scope = '' } = {}) {
    const live = enabled
      ? hands.filter(
          h =>
            Number.isFinite(h.sx) &&
            Number.isFinite(h.sy) &&
            Number.isFinite(h.observedAt) &&
            now - h.observedAt < 300 &&
            h.observedAt <= now + 20,
        )
      : [];
    const stamp = live.length ? Math.max(...live.map(h => h.observedAt)) : -Infinity;
    if (live.length && stamp < this.latest) return false;
    const key =
      scope +
      '|' +
      live
        .map(h => `${h.id}:${h.observedAt}`)
        .sort()
        .join(',');
    if (key === this.key) return false;
    this.key = key;
    if (live.length) this.latest = stamp;
    this.consume(live, now);
    return true;
  }
}
