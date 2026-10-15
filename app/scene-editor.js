// Editor de áreas sobre la escena: muestra la imagen de la cámara en miniatura con la zona de las manos (arrastrar para
// moverla, esquina para cambiar su tamaño, flechas con teclado) y dónde se detectan tus manos, y una regla para la
// distancia de la cámara. installSceneEditor({ center, handInput, applyLive, defaults }). Se ve al momento y se guarda
// al soltar. fitZone, moveZone y resizeZone son puras y las usan las pruebas.
const MIN_ZONE = 0.3;
const MAX_OFFSET = 0.7;
const KEY_STEP = 0.01;
const round = value => Math.round(value * 1000) / 1000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Mantiene la zona dentro de la imagen y con el tamaño que admite la configuración (handZone*).
export function fitZone({ x, y, width, height }) {
  const w = clamp(width, MIN_ZONE, 1),
    h = clamp(height, MIN_ZONE, 1);
  return {
    x: round(clamp(x, 0, Math.min(MAX_OFFSET, 1 - w))),
    y: round(clamp(y, 0, Math.min(MAX_OFFSET, 1 - h))),
    width: round(w),
    height: round(h),
  };
}
export const moveZone = (zone, dx, dy) => fitZone({ ...zone, x: zone.x + dx, y: zone.y + dy });
export const resizeZone = (zone, dw, dh) =>
  fitZone({
    ...zone,
    width: Math.min(zone.width + dw, 1 - zone.x),
    height: Math.min(zone.height + dh, 1 - zone.y),
  });

const toSettings = zone => ({
  handZoneX: zone.x,
  handZoneY: zone.y,
  handZoneWidth: zone.width,
  handZoneHeight: zone.height,
});
const percent = value => `${Math.round(value * 100)} %`;

function buildPanel(participation) {
  const panel = document.createElement('section');
  panel.className = 'scene-editor';
  panel.hidden = true;
  const titleId = participation ? 'participation-editor-title' : 'scene-editor-title';
  panel.setAttribute('aria-labelledby', titleId);
  panel.innerHTML = `<header class="scene-editor-header"><h2 id="scene-editor-title">Editar áreas</h2><div><button type="button" data-action="reset">Restablecer</button><button type="button" data-action="done">Listo</button></div></header>
    <p class="scene-editor-help">Arrastra la zona de las manos o su esquina. Los puntos son tus manos detectadas: si quedan dentro, llegan a toda la pantalla. Esc para salir.</p>
    <figure class="scene-editor-map"><div class="scene-editor-frame"><div class="scene-editor-zone" tabindex="0" role="group"><span class="scene-editor-grip" aria-hidden="true"></span></div><div class="scene-editor-dots" aria-hidden="true"></div></div><figcaption></figcaption></figure>
    <label class="scene-editor-distance"><span>Distancia de la cámara <output></output></span><input type="range" min="5" max="14" step="0.1"></label>`;
  document.body.append(panel);
  if (participation) {
    qPanel(panel, 'h2').id = titleId;
    qPanel(panel, 'h2').textContent = 'Zona de participación';
    qPanel(panel, '.scene-editor-help').textContent =
      'Encuadra los cuerpos completos y deja el público fuera. Arrastra la zona o su esquina; flechas para mover, Mayús + flechas para tamaño. Esc para salir.';
    qPanel(panel, '.scene-editor-distance').hidden = true;
    const video = document.createElement('video');
    video.className = 'participation-editor-video';
    video.autoplay = video.muted = video.playsInline = true;
    qPanel(panel, '.scene-editor-frame').prepend(video);
  }
  return panel;
}
const qPanel = (panel, selector) => panel.querySelector(selector);

// Arrastre sobre un elemento: onMove recibe el desplazamiento en fracción del marco; onEnd se llama al soltar.
function dragFraction(element, frame, { onStart, onMove, onEnd }) {
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Sin captura: el arrastre sigue mientras el puntero esté encima.
    }
    const box = frame.getBoundingClientRect(),
      startX = event.clientX,
      startY = event.clientY;
    onStart();
    const move = e => onMove((e.clientX - startX) / box.width, (e.clientY - startY) / box.height);
    const end = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      onEnd();
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  });
}

export function installSceneEditor({
  center,
  handInput,
  applyLive,
  defaults,
  participation = false,
  onOpen = () => {},
}) {
  const panel = buildPanel(participation);
  const settings = zone => (participation ? { participationZone: zone } : toSettings(zone));
  const q = selector => panel.querySelector(selector);
  const frame = q('.scene-editor-frame'),
    zoneBox = q('.scene-editor-zone'),
    dots = q('.scene-editor-dots'),
    caption = q('figcaption'),
    slider = q('input[type=range]'),
    distanceOut = q('output');
  let zone = null,
    loop = 0;

  const drawZone = () => {
    Object.assign(zoneBox.style, {
      left: `${zone.x * 100}%`,
      top: `${zone.y * 100}%`,
      width: `${zone.width * 100}%`,
      height: `${zone.height * 100}%`,
    });
    const text = `Zona de ${participation ? 'participación' : 'las manos'}: ${percent(zone.width)} de ancho × ${percent(zone.height)} de alto.`;
    caption.textContent = text;
    zoneBox.setAttribute('aria-label', `${text} Flechas para moverla, Mayús y flechas para cambiar su tamaño.`);
  };
  const preview = next => {
    zone = next;
    drawZone();
    applyLive({ zone });
  };
  const save = () => {
    try {
      center.save(settings(zone));
    } catch (error) {
      syncFromSettings();
      applyLive({ zone });
      caption.textContent = `No se guardó: ${error.message}`;
    }
  };
  const syncFromSettings = () => {
    const values = center.values;
    zone = fitZone(
      participation
        ? values.participationZone
        : {
            x: values.handZoneX,
            y: values.handZoneY,
            width: values.handZoneWidth,
            height: values.handZoneHeight,
          },
    );
    slider.value = String(values.cameraDistance);
    distanceOut.value = values.cameraDistance.toFixed(1);
    drawZone();
  };

  // Puntos de las manos detectadas, en la misma imagen de la cámara que la zona.
  const drawHands = () => {
    if (participation) {
      const source = document.getElementById('camera-preview-video');
      const video = q('.participation-editor-video');
      if (video.srcObject !== source?.srcObject) video.srcObject = source?.srcObject ?? null;
      if (source?.videoWidth && source.videoHeight)
        frame.style.aspectRatio = `${source.videoWidth}/${source.videoHeight}`;
    }
    const hands = handInput.current(performance.now());
    dots.replaceChildren(
      ...hands.map(hand => {
        const x = hand.trackX ?? hand.x,
          y = hand.trackY ?? hand.y,
          dot = document.createElement('span');
        const inside = x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
        dot.className = inside ? 'is-inside' : '';
        dot.style.left = `${x * 100}%`;
        dot.style.top = `${y * 100}%`;
        return dot;
      }),
    );
    loop = requestAnimationFrame(drawHands);
  };

  let start = null;
  dragFraction(zoneBox, frame, {
    onStart: () => (start = zone),
    onMove: (dx, dy) => preview(moveZone(start, dx, dy)),
    onEnd: save,
  });
  dragFraction(q('.scene-editor-grip'), frame, {
    onStart: () => (start = zone),
    onMove: (dx, dy) => preview(resizeZone(start, dx, dy)),
    onEnd: save,
  });
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  zoneBox.addEventListener('keydown', event => {
    const step = arrows[event.key];
    if (!step) return;
    event.preventDefault();
    const [dx, dy] = step.map(value => value * KEY_STEP);
    preview(event.shiftKey ? resizeZone(zone, dx, dy) : moveZone(zone, dx, dy));
    save();
  });
  slider.addEventListener('input', () => {
    const distance = Number(slider.value);
    distanceOut.value = distance.toFixed(1);
    applyLive({ distance });
  });
  slider.addEventListener('change', () => center.save({ cameraDistance: Number(slider.value) }));

  const close = () => {
    panel.hidden = true;
    syncFromSettings();
    applyLive({ zone });
    if (participation) q('.participation-editor-video').srcObject = null;
    cancelAnimationFrame(loop);
    document.removeEventListener('keydown', onEscape);
  };
  const onEscape = event => event.key === 'Escape' && close();
  const open = () => {
    onOpen();
    syncFromSettings();
    panel.hidden = false;
    document.addEventListener('keydown', onEscape);
    cancelAnimationFrame(loop);
    drawHands();
    zoneBox.focus();
  };
  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'done') close();
    if (action === 'reset') {
      center.save({ ...settings(defaults.zone), ...(participation ? {} : { cameraDistance: defaults.distance }) });
      syncFromSettings();
      applyLive({ zone, distance: defaults.distance });
    }
  });

  // Botón en Configuración → Cámara: cierra el panel para dejar ver la escena y abre el editor.
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.id = participation ? 'participation-editor-launch' : 'scene-editor-launch';
  launch.textContent = participation ? 'Editar zona de participación' : 'Editar áreas en la escena';
  launch.addEventListener('click', () => {
    try {
      open();
      launch.closest('dialog')?.close();
    } catch (error) {
      center.message(error.message);
    }
  });
  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  actions.append(launch);
  center.panel('camera').append(actions);
  return { open, close };
}
