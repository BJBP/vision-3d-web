// Interfaz pública del módulo settings. Configuración: valores, perfiles, recursos locales (vídeos/GLB) y calidad de render.
// Otros módulos y app.js importan SOLO desde este archivo.
export { PRESETS } from './settings.js';
export { center } from './configuration.js';
export { resourceStore } from './resources.js';
export { reduceQuality } from './performance.js';
