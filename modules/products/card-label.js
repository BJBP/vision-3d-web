// Textura de la cara de un panel de la galería, común a todas las vistas: número, nombre y, si la colección
// lo pide, la etiqueta del tipo. cardTexture(elemento, índice, { labels, aspect }) → THREE.CanvasTexture; cardText.
import * as THREE from 'three';

const TYPE_TAGS = { model: 'MODELO', video: 'VÍDEO', avatar: 'AVATAR', collection: 'COLECCIÓN', more: 'COLECCIONES' };
const CANVAS_WIDTH = 1024;

// `icon` es un identificador del catálogo, no un símbolo: la cara solo muestra el nombre.
export const cardText = item => (item.type === 'collection' ? `${item.name} →` : item.name).toLocaleUpperCase('es');

export function cardTexture(item, index, { labels = false, aspect = 4 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = Math.round(CANVAS_WIDTH / aspect);
  const g = canvas.getContext('2d'),
    middle = canvas.height / 2,
    wide = aspect >= 3;
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${wide ? 80 : 96}px Arial`;
  const text = cardText(item);
  g.fillText(text, wide ? 543 : CANVAS_WIDTH / 2, middle + 2, wide ? 800 : 900);
  g.globalAlpha = 0.6;
  g.font = '500 31px Arial';
  if (wide) {
    g.fillText(String(index + 1).padStart(2, '0'), 50, middle + 4);
    g.fillRect(99, middle - 45, 1, 91);
  } else {
    g.textAlign = 'left';
    g.fillText(String(index + 1).padStart(2, '0'), 56, 64);
  }
  if (labels && TYPE_TAGS[item.type]) {
    g.textAlign = 'right';
    g.font = `500 ${wide ? 26 : 34}px Arial`;
    g.fillText(TYPE_TAGS[item.type], CANVAS_WIDTH - 40, wide ? 34 : 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
