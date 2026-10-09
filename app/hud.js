// Textos de la interfaz sobre la escena: historia, estado de la cámara, invitación y depuración.
// Solo escribe en el DOM con el estado que recibe; no sube imágenes ni lee la captura directamente.
const $ = id => document.getElementById(id);

export function createHud() {
  let storyState = '';

  // state: 'idle' | 'live' | 'demo'
  function story(state) {
    if (state === storyState) return;
    storyState = state;
    const active = state === 'live' || state === 'demo';
    $('headline').innerHTML = active
      ? 'Tu movimiento.<br>Otra<br><span>dimensión.</span>'
      : 'La tecnología<br>ya tiene<br><span>presencia.</span>';
    $('description').textContent = active
      ? 'Cada gesto conecta dos mundos. El tuyo y el de las nuevas posibilidades.'
      : 'Una nueva forma de conectar el mundo físico con lo que imaginamos.';
    $('chapter-number').textContent = active ? '02' : '01';
    $('chapter-title').textContent = active ? 'La experiencia eres tú' : 'De lo posible a lo presente';
    $('chapter-detail').textContent = active
      ? 'Presencia humana · Respuesta digital'
      : 'Visión espacial · Interacción natural';
    $('scene-label').textContent =
      state === 'demo' ? 'HUMANO DIGITAL / DEMOSTRACIÓN' : active ? 'HUMANO DIGITAL / EN VIVO' : 'IDENTIDAD / HARDTECH';
  }

  // Textos de estado; se llama unas pocas veces por segundo, no en cada fotograma.
  function status({ demo, present, online, incomplete, webcam, torsoDist, idle }) {
    story(demo ? 'demo' : present ? 'live' : 'idle');
    $('connection-label').textContent = demo ? 'Demostración' : online ? 'Cámara conectada' : 'Cámara sin conexión';
    $('tracking-state').textContent = demo
      ? 'MOVIMIENTO SIMULADO'
      : incomplete
        ? 'ENCUADRE INCOMPLETO'
        : present
          ? 'PRESENCIA DETECTADA'
          : online
            ? 'ESPERANDO TU PRESENCIA'
            : 'ESCENA DISPONIBLE';
    $('distance').textContent = demo ? 'DEMO' : present && torsoDist ? torsoDist.toFixed(1) + ' m' : '—';
    $('distance-label').textContent = demo ? 'SIN CÁMARA' : webcam ? 'SIN PROFUNDIDAD MEDIDA' : 'DISTANCIA';
    $('invite-main').textContent = incomplete
      ? 'Encuadra tu cuerpo.'
      : online
        ? 'Entra en escena.'
        : 'El escenario está listo.';
    $('invite-detail').textContent = incomplete
      ? 'Deben verse hombros y caderas dentro de la imagen.'
      : online
        ? 'Colócate a 2–3 metros de la cámara.'
        : 'Conecta la cámara o explora la demostración.';
    const controls = document.querySelector('.controls');
    controls.classList.toggle('idle', idle && !controls.contains(document.activeElement));
  }

  // Visibilidad de invitación, guía e indicador de cámara. Se llama en cada fotograma: argumentos
  // sueltos para no crear un objeto por fotograma.
  function frame(present, stage, guideHidden, watching, cameraOk) {
    $('invite').classList.toggle('hidden', present || stage < 0.9);
    $('guide').classList.toggle('hidden', !present || guideHidden);
    document.querySelector('#guide [data-g="watch"]').classList.toggle('on', watching);
    $('dot').classList.toggle('ok', cameraOk);
  }

  const debugVisible = () => document.body.classList.contains('debug');

  // Panel de depuración (tecla D). Llamar solo si debugVisible().
  function debug({ fps, camOk, camFps, presence, present, torsoDist, feetVis, hands, watch }) {
    const distance = torsoDist ? torsoDist.toFixed(2) + ' m' : '-';
    $('debug').textContent =
      `render ${fps.toFixed(0)} fps · cámara ${camOk ? camFps + ' fps' : 'OFF'} · ` +
      `presencia ${(presence * 100).toFixed(0)}%\n` +
      `persona ${present ? 'sí' : 'no'} · distancia ${distance} · piernas ${(feetVis * 100).toFixed(0)}%\n` +
      `dedos: izq ${hands[0] ? 'sí' : 'aprox'} · der ${hands[1] ? 'sí' : 'aprox'} · ` +
      `reloj ${(watch * 100).toFixed(0)}%`;
  }

  return { status, frame, debug, debugVisible };
}
