const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// A stopped hand locks a panel. Small tracking noise must never spin the wheel
// or restart selection; a deliberate new vertical stroke releases the detent.
export class OrbitController {
  constructor(count = 5, step = (Math.PI * 2) / count, { holdMs = 1100 } = {}) {
    this.count = count;
    this.step = step;
    this.holdMs = holdMs;
    this.angle = 0;
    this.lastMove = -Infinity;
    this.last = -Infinity;
    this.progress = 0;
    this.focus = 0;
    this.hand = null;
    this.entered = false;
    this.intent = 'browse';
    this.yaw = 0;
    this.manualOrientUntil = -Infinity;
    this.coastVelocity = 0;
    this.coastRemaining = 0;
    this.coastUntil = -Infinity;
    this.detent = null;
  }
  move(delta, now) {
    if (Math.abs(delta) < 0.002) return;
    this.angle += clamp(delta, -0.8, 0.8);
    this.lastMove = now;
    this.progress = 0;
    this.entered = false;
    this.coastVelocity = 0;
    this.detent = null;
  }
  // Unattended rotation: glide to the next option instead of jumping (rotationSeconds in the catalog).
  advance(direction, now) {
    this.detent = (Math.round(this.angle / this.step) - Math.sign(direction)) * this.step;
    this.lastMove = Math.min(this.lastMove, now - 181);
  }
  focusIndex(index, now) {
    const period = this.count * this.step,
      target = -index * this.step;
    this.angle = target + Math.round((this.angle - target) / period) * period;
    this.lastMove = now;
    this.progress = 0;
    this.entered = false;
    this.hand = null;
    this.coastVelocity = 0;
    this.yaw = 0;
    this.manualOrientUntil = -Infinity;
    this.detent = null;
    this.focus = ((index % this.count) + this.count) % this.count;
  }
  cancel() {
    this.progress = 0;
    this.last = -Infinity;
    this.hand = null;
    this.entered = false;
    this.intent = 'browse';
    this.yaw = 0;
    this.manualOrientUntil = -Infinity;
    this.coastVelocity = 0;
  }
  orientBy(delta, now) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.001) return;
    this.yaw = clamp(this.yaw + delta, -0.9, 0.9);
    this.manualOrientUntil = now + 220;
    this.progress = 0;
    this.entered = false;
    this.coastVelocity = 0;
  }
  endOrientation(now) {
    this.manualOrientUntil = now;
  }
  releaseHand(now) {
    const hand = this.hand;
    // Only a recent deliberate flick can continue after the hand leaves. A
    // stale detector, ordinary slow stroke or body disappearance cannot spin it.
    if (hand?.moving && Math.abs(hand.speedY) > 0.85 && now - hand.speedAt < 180) {
      this.coastVelocity = clamp(((hand.speedY * this.step) / 0.105) * 0.75, -this.step * 10.5, this.step * 10.5);
      this.coastRemaining = this.step * 1.25;
      this.coastUntil = now + 420;
    } else this.coastVelocity = 0;
    this.hand = null;
    this.progress = 0;
    this.entered = false;
  }
  observeHand(y, now, { id = 0, observedAt = now, x = null } = {}) {
    if (!Number.isFinite(y) || !Number.isFinite(observedAt) || now - observedAt >= 300 || observedAt > now + 20) {
      this.cancel();
      return false;
    }
    if (!this.hand || this.hand.id !== id) {
      this.progress = 0;
      this.entered = false;
      this.coastVelocity = 0;
      this.hand = {
        id,
        anchor: y,
        applied: y,
        originY: y,
        originAngle: Math.round(this.angle / this.step) * this.step,
        moving: false,
        observedAt,
        quietAnchor: y,
        quietSince: now,
        anchorX: x,
        sampleY: y,
        speedY: 0,
        speedAt: now,
        orienting: false,
      };
      return true;
    }
    const hand = this.hand;
    // Process each camera observation once, independently of display refresh.
    if (observedAt !== hand.observedAt) {
      const sampleDt = clamp((observedAt - hand.observedAt) / 1000, 0.01, 0.4);
      hand.speedY = (y - hand.sampleY) / sampleDt;
      hand.sampleY = y;
      hand.speedAt = now;
      hand.observedAt = observedAt;
      if (Number.isFinite(x) && !Number.isFinite(hand.anchorX)) hand.anchorX = x;
      const dx = Number.isFinite(x) && Number.isFinite(hand.anchorX) ? x - hand.anchorX : 0,
        dy = y - hand.anchor;
      // The broad, dominant-axis gate is intentional: normal horizontal hand
      // tremor must not turn the wheel sideways or interrupt product selection.
      if (!hand.moving && !hand.orienting && Math.abs(dx) > 0.07 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        hand.orienting = true;
        hand.orientOriginX = hand.anchorX;
        hand.orientOriginYaw = this.yaw;
        hand.appliedX = hand.anchorX;
        hand.quietX = x;
        hand.quietXSince = now;
        hand.lastOrient = now;
      }
      if (hand.orienting) {
        if (Math.abs(x - hand.quietX) > 0.024) {
          hand.quietX = x;
          hand.quietXSince = now;
        }
        if (Math.abs(x - hand.appliedX) > 0.012) {
          this.yaw = clamp(hand.orientOriginYaw + (x - hand.orientOriginX) * 4, -0.9, 0.9);
          hand.appliedX = x;
          hand.lastOrient = now;
        }
        this.progress = 0;
        this.entered = false;
        hand.speedY = 0;
      }
      if (!hand.moving && !hand.orienting && Math.abs(dy) > 0.036) {
        hand.moving = true;
        hand.applied = hand.anchor;
        hand.quietAnchor = y;
        hand.quietSince = now;
      }
      if (hand.moving && Math.abs(y - hand.quietAnchor) > 0.024) {
        hand.quietAnchor = y;
        hand.quietSince = now;
      }
      // Accumulating against the last accepted position preserves slow strokes.
      // A 1.2% screen band rejects tremor instead of repeatedly cancelling hold.
      if (hand.moving && Math.abs(y - hand.applied) > 0.012) {
        // One option per 10.5% of screen height, independent of how many
        // duplicate panels the renderer uses around the physical wheel.
        const target = hand.originAngle + ((y - hand.originY) * this.step) / 0.105;
        this.move(target - this.angle, now);
        hand.applied = y;
      }
    }
    if (hand.orienting && (now - hand.lastOrient > 200 || now - hand.quietXSince >= 240)) {
      hand.orienting = false;
      hand.anchorX = x;
      hand.anchor = y;
      hand.applied = y;
      hand.originY = y;
      hand.originAngle = Math.round(this.angle / this.step) * this.step;
    }
    // A small oscillation after a stroke also counts as stopped. Otherwise
    // alternating detector error can keep lastMove fresh forever at 7–17 fps.
    if (hand.moving && (now - this.lastMove > 180 || now - hand.quietSince >= 220)) {
      const detent = Math.round(this.angle / this.step) * this.step;
      // A slow stroke may pause before crossing half a panel. Keep its origin
      // until it actually reaches another option, so repeated small advances
      // cannot all snap back to the same panel and discard the user's motion.
      if (Math.abs(detent - hand.originAngle) > this.step * 0.5) {
        hand.originY = y;
        hand.originAngle = detent;
      }
      hand.moving = false;
      hand.anchor = y;
      hand.anchorX = x;
      hand.applied = y;
      this.lastMove = Math.min(this.lastMove, now - 181);
    }
    return true;
  }
  update(now, { engaged = false, idle = false, idleDrift = true, reducedMotion = false, freshCapture = false } = {}) {
    const gap = now - this.last,
      animationDt = Number.isFinite(gap) ? clamp(gap / 1000, 0, 0.25) : 0;
    const holdDt = gap <= 400 || freshCapture ? animationDt : 0;
    this.last = now;
    // A renderer stall cannot skip the confirmation. Fresh new observations
    // preserve a hold but credit at most one camera-freshness interval.
    if (gap > 400 && !freshCapture) this.progress = 0;
    const orienting = Boolean(this.hand?.orienting) || now < this.manualOrientUntil;
    if (!orienting) {
      this.yaw *= Math.exp(-animationDt * 10);
      if (Math.abs(this.yaw) < 0.001) this.yaw = 0;
    }
    if (this.hand || engaged) this.coastVelocity = 0;
    let coasting = Math.abs(this.coastVelocity) > 0.015 && now < this.coastUntil && this.coastRemaining > 0;
    if (coasting) {
      const travel = (this.coastVelocity * (1 - Math.exp(-animationDt * 7))) / 7;
      const delta = Math.sign(travel) * Math.min(Math.abs(travel), this.coastRemaining);
      this.angle += delta;
      this.coastRemaining -= Math.abs(delta);
      this.coastVelocity *= Math.exp(-animationDt * 7);
      this.lastMove = now;
      this.progress = 0;
    } else if (this.coastVelocity) {
      this.coastVelocity = 0;
      this.lastMove = Math.min(this.lastMove, now - 181);
    }
    const drifting = idle && idleDrift;
    if (idle) {
      if (drifting && !reducedMotion) this.angle -= animationDt * 0.18;
      this.progress = 0;
      this.entered = false;
      this.hand = null;
      this.intent = 'browse';
    }
    if (!drifting && !coasting && now - this.lastMove > 180 && !this.hand?.moving) {
      const snap = this.detent ?? Math.round(this.angle / this.step) * this.step;
      this.angle += (snap - this.angle) * (1 - Math.exp(-animationDt * (this.detent === null ? 22 : 6)));
      if (Math.abs(snap - this.angle) < 0.002) {
        this.angle = snap;
        this.detent = null;
      }
    }
    const index = ((Math.round(-this.angle / this.step) % this.count) + this.count) % this.count;
    if (index !== this.focus) {
      this.progress = 0;
      this.entered = false;
    }
    this.focus = index;
    const settled =
      Math.abs(this.angle / this.step - Math.round(this.angle / this.step)) < 0.035 &&
      now - this.lastMove > 180 &&
      !this.hand?.moving &&
      !orienting &&
      Math.abs(this.yaw) < 0.04 &&
      !coasting;
    this.intent = orienting
      ? 'orienting'
      : coasting
        ? 'coasting'
        : idle
          ? 'browse'
          : !settled
            ? this.hand?.moving
              ? 'scrolling'
              : 'settling'
            : engaged
              ? 'holding'
              : 'browse';
    if (engaged && settled && !idle && !this.entered)
      this.progress = clamp(this.progress + holdDt / (this.holdMs / 1000), 0, 1);
    else if (!engaged || !settled || idle) {
      this.progress = 0;
      this.entered = false;
    }
    const enter = this.progress === 1 && !this.entered;
    if (enter) {
      this.entered = true;
      this.progress = 0;
    }
    if (Math.abs(this.angle) > Math.PI * 100) {
      this.angle %= this.count * this.step;
      this.detent = null;
    }
    return {
      angle: this.angle,
      focus: this.focus,
      progress: this.progress,
      enter,
      intent: this.intent,
      locked: settled,
      holdMs: this.holdMs,
      yaw: this.yaw,
      angularVelocity: this.coastVelocity,
    };
  }
}
