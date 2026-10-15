// Fija el puntero cuando la mano se queda quieta un rato. Recibe el estado anterior (o null), la posición
// filtrada (0–1) y el tiempo en ms; devuelve el nuevo estado: { x, y } es lo que se debe mostrar y `held` si está fijo.
// Para soltarlo hay que mover la mano más que `releaseRadius`; la diferencia con `stillRadius` evita parpadeos.

export const POINTER_HOLD_MS = 2000;
export const POINTER_STILL_RADIUS = 0.02;
export const POINTER_RELEASE_RADIUS = 0.045;

const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const startStill = (x, y, time) => ({ x, y, held: false, anchorX: x, anchorY: y, since: time });

export function holdPointer(
  previous,
  x,
  y,
  time,
  { holdMs = POINTER_HOLD_MS, stillRadius = POINTER_STILL_RADIUS, releaseRadius = POINTER_RELEASE_RADIUS } = {},
) {
  if (previous?.held) {
    if (distance(x, y, previous.x, previous.y) <= releaseRadius) return previous;
    return startStill(x, y, time);
  }
  if (!previous || distance(x, y, previous.anchorX, previous.anchorY) > stillRadius) return startStill(x, y, time);
  return { ...previous, x, y, held: time - previous.since >= holdMs };
}
