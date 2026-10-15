// Fits a camera-space interaction area around the measured controller torso.
// This changes cursor mapping only; it never creates observations or hands.
import { assessBodyFrame, OneEuro } from './tracking.js';
import { CURSOR_STABILITY_PRESETS } from './cursor-smoothing.js';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function participantCursorZone(pose, fallback) {
  if (!assessBodyFrame(pose).ok) return fallback;
  const sx = (pose.i[22] + pose.i[24]) / 2;
  const sy = (pose.i[23] + pose.i[25]) / 2;
  const hx = (pose.i[46] + pose.i[48]) / 2;
  const hy = (pose.i[47] + pose.i[49]) / 2;
  const torso = Math.hypot(sx - hx, sy - hy);
  const shoulders = Math.hypot(pose.i[22] - pose.i[24], pose.i[23] - pose.i[25]);
  const width = clamp(Math.max(shoulders * 2.4, torso * 1.2), 0.08, 0.9);
  const height = clamp(torso * 2.2, 0.12, 0.95);
  return {
    x: clamp((sx + hx - width) / 2, 0, 1 - width),
    y: clamp((sy + hy - height) / 2, 0, 1 - height),
    width,
    height,
  };
}

export function createParticipantCursorZone() {
  const filters = Array.from({ length: 4 }, () => new OneEuro(...CURSOR_STABILITY_PRESETS.smooth));
  let lastTime = -Infinity;
  return {
    reset() {
      filters.forEach(filter => filter.reset());
      lastTime = -Infinity;
    },
    sample(pose, fallback, now, preset = 'normal') {
      const zone = participantCursorZone(pose, fallback);
      if (zone === fallback || preset === 'legacy') {
        this.reset();
        return zone;
      }
      if (now - lastTime > 750) this.reset();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const values = [zone.x + zone.width / 2, zone.y + zone.height / 2, zone.width, zone.height].map((value, i) =>
        filters[i].filter(value, dt),
      );
      const [x, y, width, height] = values;
      return { x: clamp(x - width / 2, 0, 1 - width), y: clamp(y - height / 2, 0, 1 - height), width, height };
    },
  };
}
