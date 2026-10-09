// Interfaz pública del módulo effects. Efectos visuales: partículas configurables y fondo de escena (color, degradado, vídeo).
// Otros módulos y app.js importan SOLO desde este archivo.
export { createSceneBackground } from './scene-background.js';
export { PARTICLE_FRAGMENT_GLSL, PARTICLE_VERTEX_GLSL, createParticleEffects } from './particle-effects.js';
