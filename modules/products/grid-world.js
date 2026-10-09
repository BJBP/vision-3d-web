// Vista «cuadrícula»: celdas grandes y fijas que se eligen señalando con la mano en 2D.
// createGrid(elementos, { visible, labels }) → contrato de vistas (layouts.js), más `columns`.
import * as THREE from 'three';
import { createCardSet } from './card-panel.js';
import { gridPlan } from './layout-plans.js';

// El controlador de órbita solo necesita un paso: en la cuadrícula el «ángulo» es −índice.
const GRID_STEP = 1;

export function createGrid(items, { visible = 5, labels = false } = {}) {
  const plan = gridPlan(items.length, visible),
    group = new THREE.Group(),
    set = createCardSet(items, { width: plan.width, height: plan.height, labels });
  group.scale.setScalar(plan.scale);
  const cells = plan.cells.map((cell, index) => {
    const card = set.add(group, index);
    card.holder.position.set(cell.x, cell.y, 0);
    return card;
  });
  const progressMaterial = new THREE.MeshBasicMaterial({ color: '#71f3a0', toneMapped: false }),
    progress = new THREE.Mesh(new THREE.PlaneGeometry(plan.width - 0.12, 0.028), progressMaterial);
  progress.geometry.translate((plan.width - 0.12) / 2, 0, 0);
  group.add(progress);
  let angle = 0,
    focused = 0,
    opening = 0;

  function arrange(nextAngle, focus, hold = 0) {
    angle = nextAngle;
    focused = focus;
    opening = 0;
    group.visible = true;
    group.scale.setScalar(plan.scale);
    for (const card of cells) {
      const selected = card.index === focus;
      set.style(card, selected, 1);
      card.holder.position.z = selected ? 0.12 : 0;
    }
    const cell = plan.cells[focus];
    progress.position.set(cell.x - (plan.width - 0.12) / 2, cell.y - plan.height / 2 - 0.05, 0.2);
    progress.scale.x = Math.max(0.001, hold);
    progress.visible = hold > 0;
  }
  arrange(0, 0);

  return {
    group,
    step: GRID_STEP,
    columns: plan.columns,
    arrange,
    state: () => ({ angle, yaw: 0, roll: 0, motion: 0 }),
    open(amount) {
      opening = amount;
      group.visible = amount < 0.999;
      group.scale.setScalar(plan.scale * (1 + amount * 0.08));
      for (const card of cells) set.style(card, false, Math.max(0, 1 - amount * 1.6));
      progress.visible = false;
    },
    labels(camera, rect) {
      group.updateMatrixWorld(true);
      return items.map((item, index) => ({
        id: item.id,
        ...set.screenBox(cells[index], camera, rect),
        front: index === focused,
        visible: opening < 0.5,
      }));
    },
  };
}
