// Calidad progresiva del modo Auto: la escena arranca ligera (pocas partículas, sin efectos) y sube un escalón
// cada vez que sostiene buen ritmo; si el ritmo cae, vuelve al escalón anterior y se queda ahí.
// createQualityRamp() → { reset(ahora), frame(ahora, objetivoFps) → ¿cambió?, apply(opciones), level, state }.
export const RAMP_LEVELS = [
  { density: 0.1, bloom: false, trails: false },
  { density: 0.25, bloom: false, trails: false },
  { density: 0.5, bloom: false, trails: false },
  { density: 0.75, bloom: false, trails: false },
  { density: 1, bloom: true, trails: false },
  { density: 1, bloom: true, trails: true },
];
const SETTLE_MS = 1000; // tras un cambio, el primer segundo no cuenta (compilación de shaders, buffers)
const WINDOW_MS = 2000; // ventana de medida
// Un hueco mayor (pestaña oculta, alerta) invalida la ventana. No más corto: en un equipo lento (WebGL por
// software) hay fotogramas de 300 ms y deben contar como ritmo bajo, no como pausa.
const PAUSE_MS = 1000;
const DROP_RATIO = 0.85; // por debajo del 85 % del objetivo se baja un escalón

export function createQualityRamp(levels = RAMP_LEVELS) {
  let level = 0;
  let settled = false;
  let changedAt = 0;
  let windowStart = 0;
  let frames = 0;
  let lastFrame = 0;

  function restartWindow(now) {
    windowStart = now;
    frames = 0;
  }
  function change(next, now) {
    level = next;
    changedAt = now;
    restartWindow(now);
  }

  return {
    get level() {
      return level;
    },
    // 'subiendo' mientras busca el máximo sostenible; 'estable' cuando lo encontró.
    get state() {
      return settled ? 'estable' : 'subiendo';
    },
    reset(now) {
      settled = false;
      lastFrame = now;
      change(0, now);
    },
    // Cuenta un fotograma; devuelve true si cambió el escalón (hay que volver a aplicar la calidad).
    frame(now, targetFps) {
      const gap = now - lastFrame;
      lastFrame = now;
      if (settled) return false;
      if (gap > PAUSE_MS || now - changedAt < SETTLE_MS) {
        restartWindow(now);
        return false;
      }
      frames++;
      const elapsed = now - windowStart;
      if (elapsed < WINDOW_MS) return false;
      const fps = (frames * 1000) / elapsed;
      if (fps < targetFps * DROP_RATIO) {
        settled = true;
        if (level > 0) {
          change(level - 1, now);
          return true;
        }
        return false;
      }
      if (level === levels.length - 1) {
        settled = true;
        return false;
      }
      change(level + 1, now);
      return true;
    },
    // Recorta las opciones elegidas al escalón actual (nunca sube por encima de lo elegido).
    apply(options) {
      const step = levels[level];
      return {
        ...options,
        particleDensity: options.particleDensity * step.density,
        bloom: options.bloom && step.bloom,
        trails: options.trails && step.trails,
      };
    },
  };
}
