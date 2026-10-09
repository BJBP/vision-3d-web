// Gesto "mirar la hora": muñeca izquierda levantada frente al pecho → holograma del reloj junto al brazo.
// update(now, dt, enabled) devuelve la intensidad 0–1 del holograma; se llama en cada fotograma.
import * as THREE from 'three';
import { MID_S, HEAD } from '../modules/avatar/index.js';

const HOLD_MS = 350; // tiempo con la muñeca levantada antes de mostrar el reloj
const REDRAW_MS = 100; // el reloj se repinta como mucho 10 veces por segundo

export function createWatchGesture({ clock, J, V, scale: S }) {
  const forearm = new THREE.Vector3();
  let amount = 0,
    since = 0,
    lastDraw = 0;

  // enabled: el gesto solo cuenta con el avatar visible y fuera de los modos evento y estudio.
  function update(now, dt, enabled) {
    const fore = forearm.copy(J[15]).sub(J[13]).normalize();
    const checking =
      enabled &&
      V[15] > 0.5 &&
      J[15].y > J[13].y - 0.05 * S &&
      J[15].y > J[MID_S].y - 0.45 * S &&
      Math.abs(fore.y) < 0.75;
    if (!checking) since = 0;
    else if (!since) since = now;
    const active = checking && now - since > HOLD_MS;
    amount += ((active ? 1 : 0) - amount) * (1 - Math.exp(-dt * (active ? 5 : 3)));
    if (amount <= 0.01) {
      clock.sprite.material.opacity = 0;
      return amount;
    }
    if (now - lastDraw > REDRAW_MS) {
      clock.draw();
      lastDraw = now;
    }
    // Al costado exterior del brazo con el reloj, a la altura de la cabeza (nunca encima de ella).
    // Lado del hombro izquierdo: estable aunque la muñeca cruce el pecho.
    const side = Math.sign(J[11].x - J[MID_S].x) || 1;
    clock.sprite.position.set(
      J[11].x + side * (0.9 + amount * 0.4),
      Math.max(J[15].y + 0.4, J[HEAD].y - 0.2),
      J[15].z + 0.5,
    );
    clock.sprite.scale.setScalar(0.3 + amount * 1.15);
    clock.sprite.material.opacity = amount * 0.85;
    return amount;
  }

  return { update };
}
