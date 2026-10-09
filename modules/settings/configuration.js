import { createSettings } from './settings.js';

// Configuration must work before the 3D renderer and its assets are ready.
export const center = createSettings({
  onSource: () => center.status('La escena 3D aún no está disponible. Puedes ajustar la calidad y recargar.'),
});
center.status('Cargando escena 3D…');
