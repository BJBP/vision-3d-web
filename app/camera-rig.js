// Cámara de la escena: encuadre según pantalla y modo (fit) y seguimiento suave del avatar (follow).
// Las funciones se llaman en cada fotograma con argumentos sueltos para no crear objetos.
import * as THREE from 'three';
import { MID_H } from '../modules/avatar/index.js';

const MOBILE_WIDTH = 700;
const DISTANCE = 8.6;

export function createCameraRig({ camera, J, fitRain }) {
  let viewKey = '';

  // centered: escena centrada (modo evento o escenario limpio); si no, deja sitio al texto lateral.
  function fit(studioActive, centered) {
    camera.aspect = innerWidth / innerHeight;
    const mobile = innerWidth <= MOBILE_WIDTH;
    camera.fov = mobile ? 64 : 48;
    const mobileStudio = mobile && studioActive;
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      centered ? 0 : mobile ? (mobileStudio ? -innerWidth * 0.35 : 0) : -innerWidth * 0.15,
      centered ? 0 : mobile ? (mobileStudio ? innerHeight * 0.06 : -innerHeight * 0.11) : 0,
      innerWidth,
      innerHeight,
    );
    camera.updateProjectionMatrix();
    fitRain();
  }

  // onViewChange: se llama cuando cambia el modo estudio o el tipo de pantalla, para reencuadrar.
  function follow(dt, present, eventActive, studioActive, portrait, reducedMotion, onViewChange) {
    const mobile = innerWidth <= MOBILE_WIDTH;
    const cx = present ? J[MID_H].x * (eventActive ? 0.65 : 0.25) : 0;
    camera.position.x += (cx - camera.position.x) * dt;
    const nextViewKey = String(studioActive) + ':' + String(mobile);
    if (nextViewKey !== viewKey) {
      viewKey = nextViewKey;
      onViewChange();
    }
    const close = portrait && !mobile && present && !studioActive;
    const eventFov = Math.max(38, THREE.MathUtils.radToDeg(2 * Math.atan(2.8 / (DISTANCE * camera.aspect))));
    let targetFov = close ? 29 : 48;
    if (eventActive && !close) targetFov = eventFov;
    else if (mobile) targetFov = studioActive ? 95 : 64;
    else if (studioActive) targetFov = 40;
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * (reducedMotion ? 15 : 2.6)));
    const targetY = close ? 1.07 : eventActive && present ? -0.12 : present ? 0.2 : 0;
    camera.position.y += (targetY - camera.position.y) * (1 - Math.exp(-dt * 2.8));
    const targetZ = eventActive && present ? DISTANCE + J[MID_H].z : DISTANCE;
    camera.position.z += (targetZ - camera.position.z) * (1 - Math.exp(-dt * 2));
    camera.lookAt(
      eventActive ? camera.position.x : camera.position.x * 0.5,
      eventActive ? camera.position.y : close ? 1.03 : 0,
      0,
    );
    camera.updateProjectionMatrix();
  }

  return { fit, follow };
}
