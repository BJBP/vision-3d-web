// Calibración del avatar GLB con cuenta atrás: cierra Configuración para que te coloques de frente a la cámara, pausa
// el cursor de las manos mientras tanto (para que no seleccione nada) y calibra al terminar.
// createCalibration({ calibrate, setCursorPaused, announce, closeDialogs, seconds, wait }).run() → promesa.
const COUNTDOWN_SECONDS = 3;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createCalibration({
  calibrate,
  setCursorPaused,
  announce,
  closeDialogs = () => {},
  seconds = COUNTDOWN_SECONDS,
  wait = sleep,
}) {
  let running = false;
  return {
    get running() {
      return running;
    },
    async run() {
      if (running) return false;
      running = true;
      setCursorPaused(true);
      closeDialogs();
      try {
        for (let left = seconds; left > 0; left--) {
          announce(`Calibrando en ${left}… ponte de frente, en postura neutra y con los brazos relajados.`);
          await wait(1000);
        }
        await calibrate();
        announce('Postura calibrada.');
        return true;
      } catch (error) {
        announce(`No se pudo calibrar. ${error.message || error}`);
        return false;
      } finally {
        setCursorPaused(false);
        running = false;
      }
    },
  };
}
