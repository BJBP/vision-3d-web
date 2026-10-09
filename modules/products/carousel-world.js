// Vista «carrusel»: tambor horizontal de paneles que mira hacia fuera y gira con la mano a los lados.
// createCarousel(elementos, { visible, labels }) → contrato de vistas (layouts.js).
import * as THREE from 'three';
import { createCardSet } from './card-panel.js';
import { carouselPlan } from './layout-plans.js';

const CARD_HEIGHT = 1;
const TILT = 0.12;

export function createCarousel(items, { visible = 5, labels = false } = {}) {
  const plan = carouselPlan(items.length, visible),
    group = new THREE.Group(),
    drum = new THREE.Group(),
    set = createCardSet(items, { width: plan.width, height: CARD_HEIGHT, labels });
  group.add(drum);
  group.scale.setScalar(plan.scale);
  group.rotation.x = TILT;
  // La inclinación baja el panel delantero; se compensa para que quede a la altura de la cámara.
  group.position.y = plan.radius * plan.scale * Math.sin(TILT);
  const slots = Array.from({ length: plan.slots }, (_, slot) => {
    const card = set.add(drum, slot % items.length),
      theta = slot * plan.step;
    card.theta = theta;
    card.holder.position.set(Math.sin(theta) * plan.radius, 0, Math.cos(theta) * plan.radius);
    card.holder.rotation.y = theta;
    return card;
  });
  const progressMaterial = new THREE.MeshBasicMaterial({ color: '#71f3a0', toneMapped: false }),
    progress = new THREE.Mesh(new THREE.PlaneGeometry(plan.width - 0.12, 0.03), progressMaterial);
  progress.geometry.translate((plan.width - 0.12) / 2, 0, 0);
  progress.position.set(-(plan.width - 0.12) / 2, -CARD_HEIGHT / 2 - 0.09, plan.radius + 0.12);
  group.add(progress);
  let angle = 0,
    focused = 0,
    opening = 0;
  const front = card => Math.cos(card.theta + angle);

  function arrange(nextAngle, focus, hold = 0) {
    angle = nextAngle;
    focused = focus;
    opening = 0;
    group.visible = true;
    group.scale.setScalar(plan.scale);
    drum.rotation.y = angle;
    for (const card of slots) {
      const facing = front(card);
      set.style(card, card.index === focus && facing > 0.95, facing > 0 ? 0.35 + 0.65 * facing : 0.08);
    }
    progress.scale.x = Math.max(0.001, hold);
    progress.visible = hold > 0;
  }
  arrange(0, 0);

  return {
    group,
    step: plan.step,
    arrange,
    state: () => ({ angle, yaw: 0, roll: 0, motion: 0 }),
    open(amount) {
      opening = amount;
      group.visible = amount < 0.999;
      group.scale.setScalar(plan.scale * (1 + amount * 0.12));
      drum.rotation.y = angle + amount * 0.7;
      for (const card of slots) set.style(card, false, Math.max(0, 1 - amount * 1.6) * Math.max(0, front(card)));
      progress.visible = false;
    },
    labels(camera, rect) {
      group.updateMatrixWorld(true);
      return items.map((item, index) => {
        const card = slots.filter(slot => slot.index === index).sort((a, b) => front(b) - front(a))[0];
        return {
          id: item.id,
          ...set.screenBox(card, camera, rect),
          front: index === focused,
          visible: front(card) > 0.5 && opening < 0.5,
        };
      });
    },
  };
}
