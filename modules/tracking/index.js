// Interfaz pública del módulo tracking. Seguimiento y gestos: filtrado de pose/manos, gestos, puntero corporal y entrada de manos.
// Otros módulos y app.js importan SOLO desde este archivo.
export { OneEuro, assessBodyFrame, demoPose, validHand, validPose } from './tracking.js';
export { EnergyGesture, HandInput } from './hand-input.js';
export { BodyPointer, DwellSelector, PRIORITIES, SCENARIOS, createChoices, localProposal } from './gestures.js';
export { HandIngress } from './hand-ingress.js';
