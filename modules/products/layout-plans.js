// Medidas puras de las vistas de la galería (sin three.js, se prueban en Node): huecos del carrusel, celdas de la
// cuadrícula y textos de ayuda según el eje de cada vista. carouselPlan, gridPlan, gridNeighbor, LAYOUT_COPY.
const CAROUSEL_CARD_WIDTH = 1.3;
const CAROUSEL_MIN_RADIUS = 2.2;
const CAROUSEL_MAX_HALF_WIDTH = 3;
const GRID_CELL_WIDTH = 1.3;
const GRID_CELL_HEIGHT = 0.85;
const GRID_GAP = 0.16;
const GRID_MAX_WIDTH = 5.3;
const GRID_MAX_HEIGHT = 3.6;
// Celdas grandes para señalar con la mano, sin llegar a los controles de la derecha.
const GRID_MAX_SCALE = 1.25;

const clampVisible = visible => Math.min(12, Math.max(3, Math.round(Number(visible) || 5)));

// `visible` paneles caben en la mitad delantera del tambor; se repiten los elementos para cerrar el círculo.
export function carouselPlan(count, visible = 5) {
  const wanted = clampVisible(visible) * 2,
    copies = Math.max(1, Math.ceil(wanted / count)),
    slots = count * copies,
    step = (Math.PI * 2) / slots,
    radius = Math.max(CAROUSEL_MIN_RADIUS, (CAROUSEL_CARD_WIDTH * 1.15) / (2 * Math.sin(step / 2)));
  return { slots, step, radius, width: CAROUSEL_CARD_WIDTH, scale: Math.min(1, CAROUSEL_MAX_HALF_WIDTH / radius) };
}

// Como mucho `visible` columnas, con una forma cercana a 3:2; la cuadrícula se escala para llenar el visor.
export function gridPlan(count, visible = 5) {
  const columns = Math.max(1, Math.min(count, clampVisible(visible), Math.ceil(Math.sqrt(count * 1.5)))),
    rows = Math.ceil(count / columns),
    totalWidth = columns * GRID_CELL_WIDTH + (columns - 1) * GRID_GAP,
    totalHeight = rows * GRID_CELL_HEIGHT + (rows - 1) * GRID_GAP,
    cells = Array.from({ length: count }, (_, index) => ({
      x: (index % columns) * (GRID_CELL_WIDTH + GRID_GAP) - totalWidth / 2 + GRID_CELL_WIDTH / 2,
      y: totalHeight / 2 - Math.floor(index / columns) * (GRID_CELL_HEIGHT + GRID_GAP) - GRID_CELL_HEIGHT / 2,
    }));
  return {
    columns,
    rows,
    cells,
    width: GRID_CELL_WIDTH,
    height: GRID_CELL_HEIGHT,
    scale: Math.min(GRID_MAX_SCALE, GRID_MAX_WIDTH / totalWidth, GRID_MAX_HEIGHT / totalHeight),
  };
}

// Las flechas recorren la cuadrícula en 2D sin salirse: arriba/abajo saltan una fila, izquierda/derecha un elemento.
export function gridNeighbor(focus, key, columns, count) {
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key] ?? 0,
    next = focus + delta;
  return next >= 0 && next < count ? next : focus;
}

export const LAYOUT_COPY = {
  vertical: {
    previous: ['↑', 'Opción anterior'],
    next: ['↓', 'Opción siguiente'],
    viewport: 'Sube o baja una mano para cambiar de producto. Detén la mano para entrar.',
    nav: 'Cinta vertical de experiencias',
    hint: 'Desliza para explorar.',
  },
  horizontal: {
    previous: ['←', 'Opción anterior'],
    next: ['→', 'Opción siguiente'],
    viewport: 'Mueve una mano a los lados para girar el carrusel. Detén la mano para entrar.',
    nav: 'Carrusel de experiencias',
    hint: 'Desliza para explorar.',
  },
  grid: {
    previous: ['←', 'Opción anterior'],
    next: ['→', 'Opción siguiente'],
    viewport: 'Señala una tarjeta con la mano y mantenla quieta para entrar.',
    nav: 'Cuadrícula de experiencias',
    hint: 'Señala una tarjeta.',
  },
};
