// Mounts the scene-button editor in Appearance and applies validated local layouts.
// The selected control is previewed separately so editing never executes an action.
import { BUTTON_CONTROLS, defaultButtonPlacement, buttonRect } from '../modules/settings/index.js';

const viewport = () => ({ width: innerWidth, height: innerHeight });
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const rectStyle = rect => ({
  position: 'fixed',
  left: `${rect.x}px`,
  top: `${rect.y}px`,
  right: 'auto',
  bottom: 'auto',
  width: `${rect.width}px`,
  height: `${rect.height}px`,
  fontSize: `${rect.font}px`,
  minWidth: '0',
  minHeight: '0',
  maxWidth: 'none',
  transform: 'none',
  padding: '0.5em',
  boxSizing: 'border-box',
});

function createOverlay() {
  const overlay = document.createElement('dialog');
  overlay.className = 'button-editor-overlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-label', 'Editar botones de la escena');
  overlay.innerHTML = `<section class="button-editor-panel" aria-labelledby="button-editor-title">
    <h2 id="button-editor-title">Editar botones</h2>
    <label>Botón<select id="button-editor-selection"></select></label>
    <label>Tamaño <output id="button-editor-size-output"></output><input id="button-editor-size" type="range" min="75" max="250" step="5"></label>
    <p>Arrastra el botón o su esquina. Flechas: mover. Mayús + flechas: tamaño. Puedes apartar este panel con ⠿.</p>
    <div class="button-editor-actions"><button type="button" data-editor-action="reset">Restablecer botón</button><button type="button" data-editor-action="reset-all">Restablecer todos</button><button type="button" data-editor-action="done">Listo</button></div>
    <p class="button-editor-message" role="status"></p>
  </section>
  <div class="button-editor-preview"><span class="button-editor-label"></span><button type="button" class="button-editor-move" aria-label="Mover botón con las flechas">⠿</button><button type="button" class="button-editor-grip" aria-label="Cambiar tamaño con las flechas">↘</button></div>`;
  document.body.append(overlay);
  return overlay;
}

export function installButtonEditor({ center, gallery, onEditing = () => {} }) {
  const controls = new Map(gallery.controls().map(button => [button.dataset.productAction, button]));
  const entries = BUTTON_CONTROLS.filter(control => controls.has(control.id));
  if (!entries.length) return { editing: false };
  const overlay = createOverlay();
  const q = selector => overlay.querySelector(selector);
  const selection = q('select'),
    slider = q('input'),
    preview = q('.button-editor-preview');
  const move = q('.button-editor-move'),
    grip = q('.button-editor-grip');
  let saved = {},
    draft = null,
    editing = false,
    opener = null,
    drag = null;
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    selection.append(option);
  }
  const placement = id => saved[id] ?? defaultButtonPlacement(id, viewport());
  const apply = () => {
    for (const [id, element] of controls) {
      Object.assign(element.style, rectStyle(buttonRect(id, placement(id), viewport())));
    }
    gallery.refreshControls();
  };
  const draw = () => {
    if (!editing) return;
    const id = selection.value;
    const rect = buttonRect(id, draft, viewport());
    Object.assign(preview.style, rectStyle(rect));
    move.style.top = `${Math.max(-34, -rect.y)}px`;
    grip.style.top = `${Math.min(rect.height - 10, innerHeight - rect.y - 44)}px`;
    const entry = entries.find(control => control.id === id);
    q('.button-editor-label').textContent =
      id === 'previous' || id === 'next' ? controls.get(id).textContent.trim() : entry.label.split(' / ')[0];
    move.setAttribute('aria-label', `Mover ${entry.label}. Usa las flechas.`);
    grip.setAttribute('aria-label', `Cambiar tamaño de ${entry.label}. Usa las flechas.`);
    slider.value = String(Math.round(draft.scale * 100));
    q('output').value = `${Math.round(rect.scale * 100)} %`;
  };
  const resetDraft = () => {
    draft = { ...placement(selection.value) };
    draw();
  };
  const persist = next => {
    try {
      center.save({ buttonLayout: next });
      q('.button-editor-message').textContent = 'Cambios guardados en este navegador.';
    } catch (error) {
      saved = center.values.buttonLayout;
      apply();
      resetDraft();
      q('.button-editor-message').textContent = `No se guardó el cambio. ${error.message}`;
    }
  };
  const save = () => {
    const rect = buttonRect(selection.value, draft, viewport());
    const next = { ...draft, x: (rect.x + rect.width / 2) / innerWidth, y: (rect.y + rect.height / 2) / innerHeight };
    persist({ ...saved, [selection.value]: next });
  };
  const close = () => {
    if (!editing) return;
    drag = null;
    editing = false;
    overlay.hidden = true;
    overlay.close();
    document.body.classList.remove('editing-buttons');
    gallery.setEditing(false);
    onEditing(false);
    document.querySelector('.settings-launch')?.focus();
  };
  const open = () => {
    opener = document.activeElement;
    opener?.closest('dialog')?.close();
    editing = true;
    overlay.hidden = false;
    overlay.showModal();
    document.body.classList.add('editing-buttons');
    gallery.setEditing(true);
    onEditing(true);
    q('.button-editor-message').textContent = '';
    resetDraft();
    move.focus();
  };
  selection.addEventListener('change', resetDraft);
  slider.addEventListener('input', () => {
    draft.scale = Number(slider.value) / 100;
    draw();
  });
  slider.addEventListener('change', save);
  preview.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    preview.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      size: buttonRect(selection.value, draft, viewport()),
      initial: { ...draft },
      resize: event.target === grip,
    };
  });
  preview.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    draft = { ...drag.initial };
    if (drag.resize)
      draft.scale = clamp(drag.initial.scale * (1 + (dx + dy) / (drag.size.width + drag.size.height)), 0.75, 2.5);
    else {
      draft.x = clamp(drag.initial.x + dx / innerWidth, 0, 1);
      draft.y = clamp(drag.initial.y + dy / innerHeight, 0, 1);
    }
    draw();
  });
  preview.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    save();
  });
  const cancelDrag = () => {
    if (drag) {
      drag = null;
      resetDraft();
    }
  };
  preview.addEventListener('pointercancel', cancelDrag);
  preview.addEventListener('lostpointercapture', cancelDrag);
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  preview.addEventListener('keydown', event => {
    const step = arrows[event.key];
    if (!step) return;
    event.preventDefault();
    if (event.shiftKey || event.target === grip)
      draft.scale = clamp(draft.scale + (step[0] + step[1]) * 0.05, 0.75, 2.5);
    else {
      draft.x = clamp(draft.x + (step[0] * 8) / innerWidth, 0, 1);
      draft.y = clamp(draft.y + (step[1] * 8) / innerHeight, 0, 1);
    }
    save();
  });
  overlay.addEventListener('click', event => {
    const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
    if (action === 'done') close();
    if (action === 'reset-all') persist({});
    if (action === 'reset') {
      const next = { ...saved };
      delete next[selection.value];
      persist(next);
    }
  });
  overlay.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  overlay.addEventListener('close', close);
  document.addEventListener('keydown', event => {
    if (editing && event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  addEventListener('resize', () => {
    cancelDrag();
    apply();
    if (editing) resetDraft();
  });
  addEventListener('pagehide', close);
  center.watch(values => {
    saved = values.buttonLayout;
    apply();
    if (editing) resetDraft();
  });
  const group = document.createElement('details');
  group.className = 'settings-group';
  group.innerHTML =
    '<summary>Botones de la escena</summary><p class="settings-help">Elige posición y tamaño, también para los botones que no aparecen en la vista actual. Los cambios se conservan con tus perfiles.</p>';
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.id = 'button-editor-launch';
  launch.textContent = 'Editar en escena';
  launch.addEventListener('click', open);
  group.append(launch);
  center.panel('look').prepend(group);
  return {
    get editing() {
      return editing;
    },
    open,
    close,
  };
}
