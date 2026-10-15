// Adapts gesto-touch's screen-space antitremor presets using our existing One Euro filter.
// Each hand owns its filters and hold state; camera-space gesture measurements stay separate.
import { OneEuro } from './tracking.js';
import { holdPointer } from './pointer-hold.js';

export const CURSOR_STABILITY_PRESETS = Object.freeze({
  smooth: [0.3, 5],
  normal: [0.5, 8],
  fast: [1, 20],
});

export function smoothCursor(previous, x, y, time, dt, preset) {
  const filters = previous?.filters ?? [
    new OneEuro(...CURSOR_STABILITY_PRESETS[preset]),
    new OneEuro(...CURSOR_STABILITY_PRESETS[preset]),
  ];
  const hold = holdPointer(previous?.hold, filters[0].filter(x, dt), filters[1].filter(y, dt), time);
  return { filters, hold, x: hold.x, y: hold.y, held: hold.held };
}
