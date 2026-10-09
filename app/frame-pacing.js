// Ritmo de fotogramas al estilo de los videojuegos: límite de FPS y resolución dinámica.
// No toca el DOM ni WebGL: decide qué fotogramas procesar y qué escala de resolución usar.

const MIN_SCALE = 0.5; // nunca por debajo de la mitad de la resolución configurada
const STEP_DOWN = 0.1; // baja rápido cuando faltan FPS…
const STEP_UP = 0.05; // …y sube despacio para no oscilar
const WINDOW_MS = 1000; // los FPS se miden en ventanas de un segundo
const CALM_WINDOWS = 3; // ventanas seguidas con margen antes de subir resolución
const LIMIT_TOLERANCE_MS = 1; // margen para pantallas cuyo intervalo no es exacto (59,9 Hz…)

export function createFramePacer() {
  let scale = 1,
    lastRun = -Infinity,
    windowStart = 0,
    frames = 0,
    calm = 0;

  // fpsLimit 0 = sin límite. Con límite se saltan los fotogramas que llegan antes de tiempo. El sobrante
  // de cada intervalo pasa al siguiente: la media queda en el límite aunque la pantalla no sea múltiplo
  // (a 54 Hz, alternar 1 y 2 fotogramas da 30 FPS; sin arrastre se quedaría en 27).
  function shouldRun(now, fpsLimit) {
    if (!(fpsLimit > 0)) {
      lastRun = now;
      return true;
    }
    const interval = 1000 / fpsLimit,
      elapsed = now - lastRun;
    if (elapsed < interval - LIMIT_TOLERANCE_MS) return false;
    // Plazo fijo: el siguiente fotograma toca un intervalo después del anterior plazo, no de ahora.
    // Si vamos muy atrasados (pestaña oculta, pausa), se reinicia en vez de recuperar a ráfagas.
    lastRun = elapsed > interval * 2 ? now : lastRun + interval;
    return true;
  }

  // Se llama una vez por fotograma procesado. Devuelve la nueva escala si cambió, o null.
  function adapt(now, enabled, targetFps) {
    if (!enabled) {
      windowStart = 0;
      calm = 0;
      if (scale === 1) return null;
      scale = 1;
      return scale;
    }
    if (!windowStart) {
      windowStart = now;
      frames = 0;
      return null;
    }
    frames++;
    if (now - windowStart < WINDOW_MS) return null;
    const fps = (frames * 1000) / (now - windowStart);
    windowStart = now;
    frames = 0;
    let next = scale;
    if (fps < targetFps * 0.9) {
      next = Math.max(MIN_SCALE, scale - STEP_DOWN);
      calm = 0;
    } else if (fps >= targetFps * 0.97 && ++calm >= CALM_WINDOWS) {
      next = Math.min(1, scale + STEP_UP);
      calm = 0;
    }
    next = Math.round(next * 100) / 100;
    if (next === scale) return null;
    scale = next;
    return scale;
  }

  return {
    shouldRun,
    adapt,
    get scale() {
      return scale;
    },
    // Con la resolución ya al mínimo, el resto de recortes (partículas, bloom) quedan para la calidad Auto.
    get atMinimum() {
      return scale <= MIN_SCALE;
    },
  };
}
