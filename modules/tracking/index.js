// Interfaz pública del módulo tracking. Seguimiento y gestos: filtrado de pose/manos, gestos, puntero corporal y entrada de manos.
// Otros módulos y app.js importan SOLO desde este archivo.
export { OneEuro, assessBodyFrame, demoPose, validHand, validPose } from './tracking.js';
export { DEFAULT_HAND_ZONE, EnergyGesture, HandInput, cursorObservation } from './hand-input.js';
export { BodyPointer, DwellSelector, PRIORITIES, SCENARIOS, createChoices, localProposal } from './gestures.js';
export { HandIngress } from './hand-ingress.js';
export { createParticipants } from './participants.js';
export { participantCursorZone, createParticipantCursorZone } from './participant-cursor.js';
export { CURSOR_STABILITY_PRESETS } from './cursor-smoothing.js';

export { createPoseStability } from './pose-stability.js';
