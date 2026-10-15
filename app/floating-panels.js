// Paneles flotantes que se mueven y redimensionan con ratón, táctil o teclado y recuerdan su sitio en este navegador.
// installFloatingPanels() añade a cada panel una barra para moverlo y una esquina para cambiar su tamaño; Inicio
// (o doble clic en la barra) lo devuelve a su sitio original. clampRect es pura y la usan las pruebas.
const STORAGE_KEY = 'vision3d.beta.windows.v1';
const MIN_WIDTH = 120;
const MIN_HEIGHT = 48;
const VISIBLE_MARGIN = 48;
const KEY_STEP = 16;

// Paneles de la composición que el usuario puede colocar: [selector, id para guardar, nombre para lectores de pantalla].
const PANELS = [
  ['#camera-preview', 'camera-preview', 'la vista previa de la cámara'],
  ['.controls', 'controls', 'los controles'],
  ['.scene-status', 'scene-status', 'el estado de la escena'],
  ['#guide', 'guide', 'la guía'],
  ['.story', 'story', 'el texto de presentación'],
  ['.scene-editor', 'scene-editor', 'el editor de áreas'],
  ['.button-editor-panel', 'button-editor', 'el editor de botones'],
];

// Ajusta posición y tamaño para que el panel no sea más pequeño que el mínimo ni quede fuera de la pantalla:
// siempre queda a la vista al menos VISIBLE_MARGIN píxeles de su barra.
export function clampRect({ x, y, width, height }, viewport) {
  const w = width === undefined ? undefined : Math.max(MIN_WIDTH, Math.min(width, viewport.width));
  const h = height === undefined ? undefined : Math.max(MIN_HEIGHT, Math.min(height, viewport.height));
  return {
    x: Math.round(Math.max(VISIBLE_MARGIN - (w ?? VISIBLE_MARGIN), Math.min(x, viewport.width - VISIBLE_MARGIN))),
    y: Math.round(Math.max(0, Math.min(y, viewport.height - VISIBLE_MARGIN))),
    ...(w === undefined ? {} : { width: Math.round(w) }),
    ...(h === undefined ? {} : { height: Math.round(h) }),
  };
}

function readLayout() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Sin almacenamiento (modo privado): la disposición dura hasta recargar.
  }
}

function controlButton(className, label, text) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.setAttribute('aria-label', label);
  element.title = label;
  element.textContent = text;
  return element;
}

// Arrastre con captura del puntero: onMove recibe el desplazamiento desde el inicio; onEnd se llama al soltar.
function dragWith(handle, { onStart, onMove, onEnd }) {
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Sin captura (puntero ya liberado): el arrastre sigue mientras el puntero esté sobre el control.
    }
    const startX = event.clientX,
      startY = event.clientY;
    onStart();
    const move = moveEvent => onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onEnd();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

function makeFloating(panel, id, title, layout) {
  const viewport = () => ({ width: innerWidth, height: innerHeight });
  const apply = rect => {
    const next = clampRect(rect, viewport());
    Object.assign(panel.style, { left: `${next.x}px`, top: `${next.y}px`, right: 'auto', bottom: 'auto' });
    panel.style.transform = 'none';
    if (next.width !== undefined) panel.style.width = `${next.width}px`;
    if (next.height !== undefined) panel.style.height = `${next.height}px`;
    panel.classList.add('is-placed');
    return next;
  };
  const save = rect => {
    layout[id] = rect;
    writeLayout(layout);
  };
  const reset = () => {
    for (const key of ['left', 'top', 'right', 'bottom', 'transform', 'width', 'height']) panel.style[key] = '';
    panel.classList.remove('is-placed');
    delete layout[id];
    writeLayout(layout);
  };
  const current = () => {
    const box = panel.getBoundingClientRect();
    return { x: box.left, y: box.top, width: box.width, height: box.height };
  };
  const mover = controlButton('floating-handle', `Mover ${title}. Flechas para mover, Inicio para restaurar.`, '⠿');
  const sizer = controlButton('floating-grip', `Cambiar el tamaño de ${title} con las flechas.`, '◢');
  panel.classList.add('floating-window');
  panel.prepend(mover);
  panel.append(sizer);

  let start = null,
    last = null;
  dragWith(mover, {
    onStart: () => (start = current()),
    onMove: (dx, dy) => (last = apply({ ...layout[id], x: start.x + dx, y: start.y + dy })),
    onEnd: () => last && save(last),
  });
  dragWith(sizer, {
    onStart: () => (start = current()),
    onMove: (dx, dy) => (last = apply({ ...start, width: start.width + dx, height: start.height + dy })),
    onEnd: () => last && save(last),
  });
  mover.addEventListener('dblclick', reset);
  const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const nudge = resize => event => {
    if (event.key === 'Home') return reset();
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    const box = current(),
      [dx, dy] = step.map(value => value * KEY_STEP);
    const rect = resize
      ? { ...box, width: box.width + dx, height: box.height + dy }
      : { ...layout[id], x: box.x + dx, y: box.y + dy };
    save(apply(rect));
  };
  mover.addEventListener('keydown', nudge(false));
  sizer.addEventListener('keydown', nudge(true));
  if (layout[id]) apply(layout[id]);
  return { refit: () => layout[id] && apply(layout[id]) };
}

export function installFloatingPanels() {
  const layout = readLayout();
  const panels = PANELS.flatMap(([selector, id, title]) => {
    const panel = document.querySelector(selector);
    return panel ? [makeFloating(panel, id, title, layout)] : [];
  });
  // Al cambiar el tamaño de la ventana, los paneles colocados vuelven a quedar dentro de la pantalla.
  addEventListener('resize', () => panels.forEach(panel => panel.refit()));
}
