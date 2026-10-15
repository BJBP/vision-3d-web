// Interacción con el puntero sobre la escena: un toque dispara la reacción de las partículas una vez;
// arrastrar y la rueda giran y acercan el modelo GLB propio (si está en modo exhibición).
export function installScenePointer({
  effects,
  gallery,
  eventStage,
  customModel,
  getModelUse,
  isBlocked = () => false,
}) {
  let scenePointer = null;
  const acceptsScenePointer = target =>
    !isBlocked() &&
    !target.closest('dialog,.masthead,.controls,#camera-preview,input,select,textarea,a,button,[contenteditable]');
  addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !acceptsScenePointer(event.target)) return;
    scenePointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
  });
  addEventListener('pointermove', event => {
    if (!scenePointer || scenePointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - scenePointer.x, event.clientY - scenePointer.y) > 6) scenePointer.moved = true;
    if (
      scenePointer.moved &&
      customModel.state().loaded &&
      getModelUse() === 'display' &&
      !gallery.productVisible() &&
      !document.querySelector('dialog[open]')
    )
      customModel.rotate((event.clientX - scenePointer.lastX) * 0.009, (event.clientY - scenePointer.lastY) * 0.007);
    scenePointer.lastX = event.clientX;
    scenePointer.lastY = event.clientY;
  });
  addEventListener('pointerup', event => {
    if (!scenePointer || scenePointer.id !== event.pointerId) return;
    const pointer = scenePointer;
    scenePointer = null;
    if (pointer.moved || !acceptsScenePointer(event.target) || document.querySelector('dialog[open]')) return;
    const x = (event.clientX / innerWidth) * 2 - 1,
      y = 1 - (event.clientY / innerHeight) * 2,
      time = performance.now() / 1000;
    effects.click(x, y, time);
    gallery.click?.(x, y, time);
    eventStage.click?.(x, y, time);
  });
  addEventListener('pointercancel', () => (scenePointer = null));
  addEventListener(
    'wheel',
    event => {
      if (
        !acceptsScenePointer(event.target) ||
        !customModel.state().loaded ||
        getModelUse() !== 'display' ||
        gallery.productVisible() ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      customModel.zoom(Math.exp(-event.deltaY * 0.001));
    },
    { passive: false },
  );
}
