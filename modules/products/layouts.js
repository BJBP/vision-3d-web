// Contrato de vistas de la galería (docs/contracts.md §6): cada vista coloca los elementos de una colección y
// sabe liberarse. createLayout(tipo, elementos, layoutOptions) → { kind, axis, columns, group, step, arrange, labels,
// open, state, dispose }.
import { createRibbon } from './ribbon-world.js';
import { createCarousel } from './carousel-world.js';
import { createGrid } from './grid-world.js';

const FACTORIES = {
  ribbon: { create: createRibbon, axis: 'vertical' },
  carousel: { create: createCarousel, axis: 'horizontal' },
  grid: { create: createGrid, axis: 'grid' },
};

function disposeTree(root) {
  const seen = new Set();
  root.traverse(object => {
    if (object.geometry && !seen.has(object.geometry)) {
      seen.add(object.geometry);
      object.geometry.dispose();
    }
    for (const material of [object.material].flat().filter(Boolean)) {
      if (seen.has(material)) continue;
      seen.add(material);
      material.map?.dispose();
      material.dispose();
    }
  });
}

export const layoutKinds = () => Object.keys(FACTORIES);

export function createLayout(kind, items, options = {}) {
  const resolved = FACTORIES[kind] ? kind : 'ribbon';
  const { create, axis } = FACTORIES[resolved];
  const layout = create(items, options);
  return {
    columns: 1,
    ...layout,
    kind: resolved,
    axis,
    dispose() {
      layout.group.removeFromParent();
      disposeTree(layout.group);
    },
  };
}
