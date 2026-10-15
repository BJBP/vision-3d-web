// Validates saved scene controls and computes responsive, fully visible button rectangles.
// Positions are viewport-relative centers; scale changes the button, label and icon together.
export const BUTTON_CONTROLS = Object.freeze([
  { id: 'menu', label: 'Colección', width: 110, height: 48, font: 16 },
  { id: 'back', label: 'Volver', width: 110, height: 48, font: 16 },
  { id: 'explode', label: 'Desarmar / Armar', width: 145, height: 56, font: 18 },
  { id: 'enter', label: 'Entrar', width: 120, height: 58, font: 19 },
  { id: 'previous', label: 'Anterior', width: 48, height: 48, font: 28 },
  { id: 'next', label: 'Siguiente', width: 48, height: 48, font: 28 },
]);
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validButtonLayout(value) {
  return Boolean(
    object(value) &&
    Object.entries(value).every(([id, placement]) => {
      if (!BUTTON_CONTROLS.some(button => button.id === id) || !object(placement)) return false;
      if (Object.keys(placement).length !== 3) return false;
      return ['x', 'y', 'scale'].every(
        key =>
          typeof placement[key] === 'number' &&
          Number.isFinite(placement[key]) &&
          placement[key] >= (key === 'scale' ? 0.75 : 0) &&
          placement[key] <= (key === 'scale' ? 2.5 : 1),
      );
    }),
  );
}

function metrics(id, viewport) {
  const control = BUTTON_CONTROLS.find(button => button.id === id);
  if (!control) throw Error('Botón de escena desconocido.');
  const unit = clamp(Math.min(viewport.width, viewport.height) / 390, 1, 2);
  return { width: control.width * unit, height: control.height * unit, font: control.font * unit };
}

export function defaultButtonPlacement(id, viewport) {
  const size = metrics(id, viewport);
  if (['menu', 'back', 'explode'].includes(id)) {
    const menu = metrics('menu', viewport);
    return {
      x: (viewport.width * 0.06 + size.width / 2) / viewport.width,
      y: id === 'explode' ? 0.5 + (menu.height / 2 + 12 + size.height / 2) / viewport.height : 0.5,
      scale: 1,
    };
  }
  const portrait = viewport.height > viewport.width || viewport.width <= 700;
  const offset = metrics('enter', viewport).width / 2 + 20 + metrics('next', viewport).width / 2;
  return {
    x: portrait ? 0.5 + (id === 'enter' ? 0 : id === 'next' ? offset : -offset) / viewport.width : 0.88,
    y: portrait ? 0.78 : id === 'previous' ? 0.35 : id === 'enter' ? 0.5 : 0.65,
    scale: 1,
  };
}

export function buttonRect(id, placement, viewport) {
  const base = metrics(id, viewport);
  const scale = clamp(
    placement.scale,
    44 / Math.min(base.width, base.height),
    Math.min((viewport.width - 24) / base.width, (viewport.height - 24) / base.height),
  );
  const width = base.width * scale,
    height = base.height * scale;
  return {
    x: clamp(placement.x * viewport.width - width / 2, 12, viewport.width - width - 12),
    y: clamp(placement.y * viewport.height - height / 2, 12, viewport.height - height - 12),
    width,
    height,
    font: base.font * scale,
    scale,
  };
}
