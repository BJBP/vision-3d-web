// Interfaz pública del módulo avatar. Cuerpo y avatares: partículas del cuerpo, avatar humano, escenario y modelos GLB propios.
// Otros módulos y app.js importan SOLO desde este archivo.
export { DEFORM_GLSL, HAND_A, HAND_B, HEAD, JOINTS, MID_H, MID_S, NECK, buildBody } from './body.js';
export { APPEARANCES, FINISHES, createHumanAvatar } from './human-avatar.js';
export { createStage } from './avatar.js';
export { createCustomModel } from './custom-model.js';
export { inspectModelRig } from './model-rig.js';
export { createModelThumbnailer } from './model-thumbnail.js';
