// Paneles de las vistas carrusel y cuadrícula: cuerpo oscuro, borde luminoso y cara con el nombre. Comparten
// geometrías y texturas. createCardSet(elementos, { width, height, labels }) → { cards, add, style, screenBox }.
import * as THREE from 'three';
import { rounded, extrude } from './product-geometry.js';
import { cardTexture } from './card-label.js';

const corners = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

export function createCardSet(items, { width, height, labels = false }) {
  const outer = rounded(width, height, 0.09);
  outer.holes.push(rounded(width - 0.05, height - 0.05, 0.07, THREE.Path));
  const rimGeometry = extrude(outer, 0.08),
    bodyGeometry = extrude(rounded(width - 0.045, height - 0.045, 0.08), 0.055),
    faceGeometry = new THREE.PlaneGeometry(width - 0.1, height - 0.08),
    textures = items.map((item, index) => cardTexture(item, index, { labels, aspect: width / height })),
    cards = [],
    point = new THREE.Vector3();

  function add(parent, index) {
    const holder = new THREE.Group(),
      edge = new THREE.MeshStandardMaterial({
        color: '#8bb8a0',
        metalness: 0.72,
        roughness: 0.23,
        emissive: '#28b965',
        emissiveIntensity: 0.4,
        transparent: true,
      }),
      body = new THREE.MeshPhysicalMaterial({
        color: '#08100c',
        metalness: 0.22,
        roughness: 0.42,
        clearcoat: 0.08,
        transparent: true,
      }),
      type = new THREE.MeshBasicMaterial({
        map: textures[index],
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
      face = new THREE.Mesh(faceGeometry, type);
    face.position.z = 0.045;
    holder.add(new THREE.Mesh(bodyGeometry, body), new THREE.Mesh(rimGeometry, edge), face);
    parent.add(holder);
    const card = { holder, edge, body, type, index };
    cards.push(card);
    return card;
  }

  // `visibility` 0–1 atenúa los paneles de atrás o los que se desvanecen al entrar en un elemento.
  function style(card, selected, visibility = 1) {
    card.edge.emissive.set(selected ? '#5bff98' : '#249c4c');
    card.edge.emissiveIntensity = selected ? 1.25 : 0.35;
    card.edge.opacity = visibility;
    card.body.color.set(selected ? '#d1edda' : '#08110d');
    card.body.opacity = visibility;
    card.type.color.set(selected ? '#082518' : '#e2eee7');
    card.type.opacity = visibility;
    card.holder.scale.setScalar(selected ? 1.06 : 1);
  }

  function screenBox(card, camera, rect) {
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    for (const [x, y] of corners) {
      point
        .set(x * width, y * height, 0.06)
        .applyMatrix4(card.holder.matrixWorld)
        .project(camera);
      const sx = rect.left + ((point.x + 1) * rect.width) / 2,
        sy = rect.top + ((1 - point.y) * rect.height) / 2;
      left = Math.min(left, sx);
      right = Math.max(right, sx);
      top = Math.min(top, sy);
      bottom = Math.max(bottom, sy);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  return { cards, add, style, screenBox };
}
