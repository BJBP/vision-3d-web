// Controles de la interfaz: botones, atajos de teclado, aviso breve (toast) y pantalla completa.
// Solo traduce entradas en acciones; el estado lo guarda app.js y llega por las funciones de `actions`.
const $ = id => document.getElementById(id);

let toastTimer;
export function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400);
}

export async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast('Usa F11 para activar pantalla completa en este navegador.');
  }
}

// Atajos de teclado: tecla → nombre de acción (ver el diálogo de ayuda en index.html).
const KEYS = {
  a: 'appearanceDialog',
  e: 'studio',
  o: 'operatorControls',
  v: 'view',
  d: 'debug',
  h: 'clean',
  f: 'fullscreen',
  p: 'demo',
  m: 'surface',
  c: 'cursor',
  r: 'motion',
  q: 'quality',
  '?': 'helpDialog',
};

// actions: { demo, surface, cursor, motion, quality, studio, view, clean, render(kind), appearance(value),
// finish(value), skin(value, button), interact }. Los diálogos y clases de depuración se resuelven aquí.
export function installControls(actions) {
  const all = {
    ...actions,
    fullscreen,
    appearanceDialog: () => $('appearance-dialog').showModal(),
    helpDialog: () => $('help-dialog').showModal(),
    operatorControls: () => document.body.classList.toggle('operator-controls'),
    debug: () => document.body.classList.toggle('debug'),
  };
  $('demo-button').onclick = all.demo;
  $('surface-button').onclick = all.surface;
  $('motion-button').onclick = all.motion;
  $('cursor-button').onclick = all.cursor;
  $('quality-button').onclick = all.quality;
  $('fullscreen-button').onclick = all.fullscreen;
  $('help-button').onclick = all.helpDialog;
  $('studio-button').onclick = all.studio;
  $('appearance-button').onclick = all.appearanceDialog;
  $('view-button').onclick = all.view;
  document.querySelectorAll('[data-render]').forEach(b => (b.onclick = () => all.render(b.dataset.render)));
  document.querySelectorAll('[data-appearance]').forEach(b => (b.onclick = () => all.appearance(b.dataset.appearance)));
  document.querySelectorAll('[data-finish]').forEach(b => (b.onclick = () => all.finish(b.dataset.finish)));
  document.querySelectorAll('[data-skin]').forEach(b => (b.onclick = () => all.skin(b.dataset.skin, b)));

  addEventListener('pointermove', all.interact);
  addEventListener('pointerdown', all.interact);
  addEventListener('keydown', e => {
    all.interact();
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (document.querySelector('dialog[open]')) return;
    if (document.body.classList.contains('editing-buttons')) return;
    const action = KEYS[e.key.toLowerCase()];
    if (action) all[action]();
  });
}
