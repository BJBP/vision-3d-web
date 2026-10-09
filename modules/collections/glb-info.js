// Lee del bloque JSON de un .glb los nombres de sus animaciones, sin cargar el modelo (para el editor de colecciones).
// glbAnimationNames(ArrayBuffer) → ['Caminar', 'animation_1', …]; [] si no tiene o no es un GLB.
const MAGIC = 0x46546c67; // «glTF»
const JSON_CHUNK = 0x4e4f534a; // «JSON»
const MAX_JSON_BYTES = 8 * 1024 * 1024;

export function glbAnimationNames(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) return [];
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(16, true) !== JSON_CHUNK) return [];
  const length = view.getUint32(12, true);
  if (length > MAX_JSON_BYTES || 20 + length > buffer.byteLength) return [];
  try {
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
    // Mismo nombre que da GLTFLoader a una animación sin nombre, para encontrarla al abrir el modelo.
    return (json.animations ?? []).map((animation, index) => animation.name || `animation_${index}`);
  } catch (error) {
    console.warn('No se pudieron leer las animaciones del GLB:', error);
    return [];
  }
}
