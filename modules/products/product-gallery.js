// Galería de productos del modo evento: selección por gesto (girar, pellizcar), rotación
// desatendida y campo de presencia. createProductGallery(renderer, opciones).
import { DEFAULT_CATALOG } from './product-models.js';
import { createItemViewer } from './item-viewer.js';
import { createProductWorld } from './product-world.js';
import { DwellSelector } from '../tracking/index.js';
import { OrbitController } from './orbit-controller.js';
import { createPresenceField } from './presence-field.js';
import { HandIngress } from '../tracking/index.js';
import { gridNeighbor, LAYOUT_COPY } from './layout-plans.js';

const AVATAR_ITEM = { id: 'avatar', type: 'avatar', name: 'Avatar' };

// Without a catalog navigator the gallery shows one collection and has nowhere to go back to.
function singleCollection(collection) {
  return {
    current: () => collection,
    items: () => collection.items,
    open: () => false,
    back: () => false,
    canGoBack: () => false,
    trail: () => [collection.name],
  };
}
const IDLE_RETURN_MS = 30000;

export function createProductGallery(
  renderer,
  { initial = null, enabled = true, collection = null, navigator = null, layout: layoutOverride = null } = {},
) {
  if (!enabled)
    return {
      state: () => ({ active: false, selected: 'avatar' }),
      productVisible: () => false,
      avatarVisible: () => true,
      configure() {},
      click() {},
      showAvatar() {},
      ingestSilhouette() {},
      ingestHands() {},
      clearPresence() {},
      update() {},
      render() {},
    };
  const browser = navigator ?? singleCollection(collection ?? DEFAULT_CATALOG.collections[0]);
  let items = browser.items();
  const layoutKind = () => layoutOverride ?? browser.current().layout,
    layoutOptions = () => browser.current().layoutOptions ?? {};
  const field = createPresenceField(),
    world = createProductWorld(renderer, field, items, layoutKind(), layoutOptions()),
    dwell = new DwellSelector(950);
  let orbit = new OrbitController(items.length, world.step);
  const focusHistory = [];
  const root = document.createElement('section');
  root.id = 'product-gallery';
  root.setAttribute('aria-label', 'Colección interactiva');
  root.innerHTML = `<div class="product-heading"><h1 id="product-name">Colección</h1><span id="product-status">VISIÓN 3D</span></div>
    <div id="product-viewport" role="region" tabindex="0" aria-label="Sube o baja una mano para cambiar de producto. Detén la mano para entrar."></div>
    <nav id="product-ribbon" aria-label="Cinta vertical de experiencias"></nav>
    <div id="orbit-controls"><button type="button" class="orbit-arrow" data-product-action="previous" aria-label="Opción anterior">↑</button><button type="button" id="orbit-enter" data-product-action="enter" aria-label="Entrar en Reloj"><span aria-hidden="true">Entrar</span><span id="orbit-name" class="visually-hidden">Reloj</span><span class="orbit-meter"><span id="orbit-progress"></span></span></button><button type="button" class="orbit-arrow" data-product-action="next" aria-label="Opción siguiente">↓</button></div>
    <p id="orbit-hint">Sube o baja la mano.</p>
    <div id="product-part" hidden></div>
    <div id="product-actions"><button type="button" data-product-action="explode" id="product-explode"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="m3 9 11-6 11 6-11 6Zm0 6 11 6 11-6M3 21l11 6 11-6"/></svg><span id="product-explode-label">Desarmar</span></button><span id="product-hint">Mueve la mano para girar.</span></div>
    <button type="button" id="product-menu" data-product-action="menu">↶ Colección</button>
    <button type="button" id="collection-back" data-product-action="back" hidden>↶ Volver</button>
    <div id="product-cursor" hidden aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="25"/><circle id="product-progress" cx="32" cy="32" r="25"/></svg><span></span></div>`;
  document.body.append(root);
  const $ = id => root.querySelector('#' + id);
  // Names come from the catalog: build the buttons with textContent, never innerHTML.
  function renderRibbonButtons() {
    $('product-ribbon').replaceChildren(
      ...items.map(item => {
        const button = document.createElement('button'),
          label = document.createElement('span');
        button.type = 'button';
        button.dataset.productAction = `focus:${item.id}`;
        button.dataset.itemType = item.type;
        button.setAttribute('aria-pressed', 'false');
        label.textContent = item.name;
        button.append(label);
        return button;
      }),
    );
  }
  renderRibbonButtons();
  // Arrows, hints and accessible names follow the axis of the current view.
  function applyLayoutCopy() {
    const copy = LAYOUT_COPY[world.axis];
    for (const [action, [symbol, label]] of [
      ['previous', copy.previous],
      ['next', copy.next],
    ]) {
      const button = root.querySelector(`[data-product-action="${action}"]`);
      button.textContent = symbol;
      button.setAttribute('aria-label', label);
    }
    $('product-viewport').setAttribute('aria-label', copy.viewport);
    $('product-ribbon').setAttribute('aria-label', copy.nav);
  }
  applyLayoutCopy();
  const itemOf = id => items.find(item => item.id === id) ?? (id === AVATAR_ITEM.id ? AVATAR_ITEM : null);
  let selected = items.some(item => item.id === initial && ['model', 'video', 'avatar'].includes(item.type))
      ? initial
      : null,
    phase = selected ? 'inspect' : 'browse',
    active = false,
    present = false,
    rect = null,
    targets = [],
    customAvatar = false;
  let lastLayout = 0,
    lastAction = performance.now(),
    lastSeen = lastAction,
    lastHover = null,
    control = null,
    handId = null,
    drag = null,
    mouseUntil = 0,
    mouseEngaged = false,
    zoomBase = null,
    blocked = false,
    latch = null;
  let orbitState = { angle: 0, focus: 0, progress: 0 },
    lastDemo = null,
    suppressClickUntil = 0,
    lastPressedKey = null,
    pinchHeld = false,
    motionEngaged = false,
    lastAdvance = 0;
  const focusId = () => items[orbitState.focus].id;
  const shownType = () => (phase === 'inspect' ? itemOf(selected)?.type : null),
    showsAvatar = () => shownType() === 'avatar',
    showsModel = () => shownType() === 'model';
  const viewer = createItemViewer({
    viewport: $('product-viewport'),
    world,
    onStatus: text => {
      $('product-part').textContent = text;
      $('product-part').hidden = !text;
    },
    onReady: () => sync(),
  });
  function layout() {
    rect = $('product-viewport').getBoundingClientRect();
    targets = [...root.querySelectorAll('[data-product-action]')]
      .filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')
      .map(button => ({ id: button.dataset.productAction, button, rect: button.getBoundingClientRect() }));
  }
  const ingress = new HandIngress((hands, now) => {
    motionEngaged = false;
    const handTargets = targets.filter(t => !t.id.startsWith('focus:'));
    const candidates = hands.toSorted(
      (a, b) => Number(b.source === 'fingers') - Number(a.source === 'fingers') || a.sy - b.sy,
    );
    const overButton = h =>
      handTargets.some(
        t =>
          h.sx * innerWidth >= t.rect.left &&
          h.sx * innerWidth <= t.rect.right &&
          h.sy * innerHeight >= t.rect.top &&
          h.sy * innerHeight <= t.rect.bottom,
      );
    const primary = candidates.find(h => h.id === handId) ?? candidates.find(overButton) ?? candidates[0];
    if (!primary) {
      if (orbit.hand) orbit.releaseHand(now);
      handId = null;
      control = null;
      zoomBase = null;
      dwell.reset();
      return;
    }
    if (handId !== primary.id) {
      handId = primary.id;
      control = null;
      zoomBase = null;
      dwell.reset();
      orbit.cancel();
    }
    const x = primary.sx * innerWidth,
      y = primary.sy * innerHeight;
    const hover = handTargets.find(t => x >= t.rect.left && x <= t.rect.right && y >= t.rect.top && y <= t.rect.bottom);
    const within = rect && x > rect.left && x < rect.right && y > rect.top && y < rect.bottom;
    if (phase === 'browse' && !drag && world.axis === 'grid') {
      // Grid: the hand over a cell focuses it; holding it still there (or on «Entrar») enters.
      const cell = targets.find(
        t =>
          t.id.startsWith('focus:') && x >= t.rect.left && x <= t.rect.right && y >= t.rect.top && y <= t.rect.bottom,
      );
      const index = cell && !hover ? items.findIndex(item => `focus:${item.id}` === cell.id) : -1;
      if (index >= 0 && index !== orbit.focus) orbit.focusIndex(index, now);
      motionEngaged = index >= 0 || hover?.id === 'enter';
      control = motionEngaged ? { mode: 'orbit', x: primary.sx, y: primary.sy } : null;
      if (motionEngaged) lastAction = now;
    } else if (phase === 'browse' && !drag) {
      motionEngaged = (within && !hover) || hover?.id === 'enter';
      if (motionEngaged) {
        // The carousel turns with sideways movement and has no separate orientation gesture.
        const horizontal = world.axis === 'horizontal';
        motionEngaged = orbit.observeHand(horizontal ? primary.sx : primary.sy, now, {
          id: primary.id,
          observedAt: primary.observedAt,
          x: horizontal ? null : primary.sx,
        });
        control = { mode: 'orbit', x: primary.sx, y: primary.sy };
        lastAction = now;
      } else {
        control = null;
        if (orbit.hand) orbit.releaseHand(now);
      }
    } else if (showsModel() && !hover && within && !drag) {
      const second = candidates.find(h => h.id !== primary.id && h.sy < 0.74);
      if (second) {
        const span = Math.hypot(primary.sx - second.sx, primary.sy - second.sy),
          cx = (primary.sx + second.sx) / 2,
          cy = (primary.sy + second.sy) / 2;
        if (!zoomBase || zoomBase.id !== second.id)
          zoomBase = { id: second.id, span: Math.max(0.05, span), zoom: world.state().zoom };
        world.zoom((zoomBase.zoom * span) / zoomBase.span);
        if (control?.mode === 'two') world.rotate((cx - control.x) * 5, (cy - control.y) * 3);
        control = { mode: 'two', x: cx, y: cy };
      } else {
        zoomBase = null;
        if (control?.mode === 'one') world.rotate((primary.sx - control.x) * 6, (primary.sy - control.y) * 4);
        control = { mode: 'one', x: primary.sx, y: primary.sy };
      }
      lastAction = now;
    } else {
      control = null;
      zoomBase = null;
    }
  });
  function ingestHands(hands, now, { available = active, demo = lastDemo, blocked: isBlocked = blocked } = {}) {
    ingress.push(hands, now, {
      enabled: enabled && available && !isBlocked && !demo,
      scope: `${phase}:${selected}:${Boolean(drag)}`,
    });
  }
  function sync() {
    root.classList.toggle('browsing', phase === 'browse');
    root.classList.toggle('avatar-selected', showsAvatar());
    root.classList.toggle('video-selected', shownType() === 'video');
    root.classList.toggle('single-part', showsModel() && world.state().parts < 2);
    $('product-name').textContent = phase === 'browse' ? browser.trail().join(' › ') : itemOf(selected).name;
    $('collection-back').hidden = phase !== 'browse' || !browser.canGoBack();
    const exploded = showsModel() && world.state().exploded;
    $('product-explode-label').textContent = exploded ? 'Armar' : 'Desarmar';
    $('product-explode').setAttribute('aria-pressed', String(exploded));
    if (phase === 'browse') $('product-part').hidden = true;
    layout();
  }
  // Rebuilds the layout for the navigator's current collection, focused on `focus`.
  function showCollection(focus = 0) {
    items = browser.items();
    world.setItems(items, layoutKind(), layoutOptions());
    orbit = new OrbitController(items.length, world.step);
    applyLayoutCopy();
    orbit.focusIndex(Math.min(focus, items.length - 1), performance.now());
    orbitState = { angle: orbit.angle, focus: orbit.focus, progress: 0 };
    phase = 'browse';
    selected = null;
    viewer.hide();
    renderRibbonButtons();
    sync();
  }
  function openCollection(slug) {
    const from = orbitState.focus;
    if (!browser.open(slug)) return;
    focusHistory.push(from);
    showCollection();
  }
  function goBack() {
    if (browser.back()) showCollection(focusHistory.pop() ?? 0);
  }
  function enter(id) {
    const item = itemOf(id);
    if (item.type === 'collection' || item.type === 'more') {
      openCollection(item.type === 'more' ? item.id : item.target);
      return;
    }
    selected = id;
    phase = 'inspect';
    motionEngaged = false;
    $('product-part').hidden = true;
    viewer.show(itemOf(id));
    orbit.cancel();
    sync();
  }
  function action(id) {
    const now = performance.now();
    lastAction = now;
    control = null;
    zoomBase = null;
    mouseEngaged = false;
    motionEngaged = false;
    orbit.cancel();
    if (id === 'menu') {
      phase = 'browse';
      viewer.hide();
      orbit.focusIndex(
        Math.max(
          0,
          items.findIndex(item => item.id === selected),
        ),
        now,
      );
      selected = null;
      sync();
    } else if (id === 'explode' && showsModel()) {
      world.toggle();
      sync();
    } else if (phase === 'browse') {
      if (id === 'back') goBack();
      else if (id === 'enter') enter(focusId());
      else if (id === 'previous' || id === 'next')
        orbit.focusIndex((orbitState.focus + (id === 'next' ? 1 : -1) + items.length) % items.length, now);
      else if (id.startsWith('focus:')) {
        const index = items.findIndex(item => item.id === id.slice(6));
        if (index === orbitState.focus) enter(items[index].id);
        else if (index >= 0) orbit.focusIndex(index, now);
      }
    }
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-product-action]');
    if (b && active && !blocked && (performance.now() > suppressClickUntil || !e.target.closest('#product-ribbon'))) {
      action(b.dataset.productAction);
      dwell.reset();
    }
  });
  $('orbit-enter').addEventListener('pointerenter', () => {
    mouseEngaged = true;
    mouseUntil = performance.now() + 60000;
  });
  $('orbit-enter').addEventListener('pointerleave', () => {
    mouseEngaged = false;
    orbit.cancel();
  });
  const viewport = $('product-viewport');
  const dragSurface = e => e.target === viewport || e.target.closest('#product-ribbon');
  root.addEventListener('pointerdown', e => {
    if (!dragSurface(e) || !active || blocked || (phase === 'inspect' && !showsModel())) return;
    if (phase === 'browse') orbit.cancel();
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      axis: null,
      moved: false,
    };
    mouseUntil = performance.now() + 1500;
    mouseEngaged = false;
  });
  root.addEventListener('pointermove', e => {
    if (!active || blocked || (phase === 'inspect' && !showsModel()) || (!drag && !dragSurface(e))) return;
    const now = performance.now();
    mouseUntil = now + 60000;
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        root.setPointerCapture(e.pointerId);
      }
      if (drag.moved) {
        if (phase === 'browse') {
          if (!drag.axis) {
            const totalX = e.clientX - drag.startX,
              totalY = e.clientY - drag.startY;
            if (Math.max(Math.abs(totalX), Math.abs(totalY)) > 12)
              drag.axis = Math.abs(totalX) > Math.abs(totalY) * 1.4 ? 'horizontal' : 'vertical';
          }
          // Dragging along the view's axis browses; across the ribbon it orients it. The grid does not drag.
          const along = { vertical: 'vertical', horizontal: 'horizontal' }[world.axis];
          if (drag.axis && drag.axis === along)
            orbit.move((along === 'horizontal' ? dx / rect.width : dy / rect.height) * 3, now);
          else if (drag.axis === 'horizontal' && along === 'vertical') orbit.orientBy((dx / rect.width) * 3.5, now);
        } else world.rotate(dx * 0.009, dy * 0.007);
        if (drag.axis || phase !== 'browse') {
          drag.x = e.clientX;
          drag.y = e.clientY;
        }
        lastAction = now;
      }
    }
    if (phase === 'inspect') {
      const name = world.pick(e.clientX, e.clientY, rect);
      $('product-part').textContent = name ?? '';
      $('product-part').hidden = !name;
    }
  });
  root.addEventListener('pointerup', () => {
    if (drag?.moved) suppressClickUntil = performance.now() + 500;
    orbit.endOrientation(performance.now());
    drag = null;
  });
  root.addEventListener('pointercancel', () => {
    drag = null;
    mouseEngaged = false;
    orbit.cancel();
  });
  root.addEventListener('lostpointercapture', () => {
    drag = null;
  });
  root.addEventListener('pointerleave', () => {
    if (!drag) {
      mouseEngaged = false;
      orbit.cancel();
      world.clearHover();
      $('product-part').hidden = true;
    }
  });
  root.addEventListener(
    'wheel',
    e => {
      if (!dragSurface(e) || !active || blocked) return;
      e.preventDefault();
      lastAction = performance.now();
      if (phase === 'browse') {
        orbit.move(-e.deltaY * 0.0025, lastAction);
        mouseEngaged = false;
      } else world.zoom(world.state().zoom * Math.exp(-e.deltaY * 0.001));
    },
    { passive: false },
  );
  viewport.addEventListener('keydown', e => {
    if (!active || blocked) return;
    if (phase === 'browse') {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        if (world.axis === 'grid')
          orbit.focusIndex(gridNeighbor(orbitState.focus, e.key, world.columns, items.length), performance.now());
        else action(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 'next' : 'previous');
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        action('enter');
      }
    } else {
      const turns = { ArrowLeft: [-0.18, 0], ArrowRight: [0.18, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] };
      if (turns[e.key]) {
        e.preventDefault();
        world.rotate(...turns[e.key]);
        lastAction = performance.now();
      }
    }
  });
  if (selected) viewer.show(itemOf(selected));
  sync();
  addEventListener('resize', layout);
  return {
    configure(settings) {
      customAvatar = !!settings.modelId;
      field.configure(settings);
      world.configure(settings);
    },
    click: field.click,
    showAvatar() {
      lastAction = performance.now();
      enter(items.find(item => item.type === 'avatar')?.id ?? AVATAR_ITEM.id);
    },
    ingestSilhouette: (texture, now) => field.ingest(texture, now),
    ingestHands,
    clearPresence: () => field.clear(),
    state: () => ({
      enabled,
      active,
      phase,
      selected,
      focus: focusId(),
      presence: field.state(),
      present,
      ribbon: phase === 'browse',
      orbit: { ...orbitState },
      product: world.state(),
      input: control?.mode ?? 'rest',
    }),
    productVisible: () => active && (phase === 'browse' || showsModel()),
    avatarVisible: () => active && showsAvatar(),
    update({ now, dt, available, present: seen, hands, reducedMotion, demo, blocked: isBlocked = false }) {
      active = enabled && available;
      blocked = isBlocked;
      present = seen;
      root.hidden = !active;
      document.body.classList.toggle('product-mode', active && (phase === 'browse' || showsModel()));
      field.update({
        now,
        dt,
        hands: active && !blocked && !demo ? hands : [],
        reducedMotion,
        inspect: phase === 'inspect',
      });
      if (!active || blocked) {
        dwell.reset();
        orbit.cancel();
        control = null;
        zoomBase = null;
        drag = null;
        mouseEngaged = false;
        $('product-cursor').hidden = true;
        return;
      }
      if (lastDemo !== demo) {
        lastDemo = demo;
        control = null;
        zoomBase = null;
        dwell.reset();
        orbit.cancel();
      }
      if (present) lastSeen = now;
      if (
        phase === 'inspect' &&
        !present &&
        !drag &&
        !(showsAvatar() && customAvatar) &&
        !viewer.playing() &&
        now - Math.max(lastSeen, lastAction) > 12000
      )
        action('menu');
      else if (
        phase === 'browse' &&
        browser.canGoBack() &&
        !present &&
        !drag &&
        now - Math.max(lastSeen, lastAction) > IDLE_RETURN_MS
      ) {
        // An unattended kiosk returns to its start collection.
        while (browser.back());
        focusHistory.length = 0;
        showCollection();
      }
      if (now - lastLayout > 250) {
        layout();
        lastLayout = now;
      }
      // WS has usually consumed this sample already. This call only handles
      // expiry, changed context or a caller without direct camera ingress.
      ingestHands(hands, now, { available, demo, blocked: isBlocked });
      const handTargets = targets.filter(t => !t.id.startsWith('focus:'));
      const candidates = hands
          .filter(
            h =>
              Number.isFinite(h.sx) &&
              Number.isFinite(h.sy) &&
              Number.isFinite(h.observedAt) &&
              now - h.observedAt < 300,
          )
          .toSorted((a, b) => Number(b.source === 'fingers') - Number(a.source === 'fingers') || a.sy - b.sy),
        overButton = h =>
          handTargets.some(
            t =>
              h.sx * innerWidth >= t.rect.left &&
              h.sx * innerWidth <= t.rect.right &&
              h.sy * innerHeight >= t.rect.top &&
              h.sy * innerHeight <= t.rect.bottom,
          );
      const primary = candidates.find(h => h.id === handId) ?? candidates.find(overButton) ?? candidates[0];
      $('product-cursor').hidden = !primary || demo;
      let engaged = false;
      if (primary && !demo) {
        const x = primary.sx * innerWidth,
          y = primary.sy * innerHeight;
        $('product-cursor').style.transform = `translate(${x}px,${y}px)`;
        if (latch && (x < latch.left - 10 || x > latch.right + 10 || y < latch.top - 10 || y > latch.bottom + 10)) {
          dwell.reset();
          latch = null;
        }
        if (handId !== primary.id) {
          handId = primary.id;
          dwell.reset();
          control = null;
          orbit.cancel();
        }
        const hover =
          handTargets.find(t => x >= t.rect.left && x <= t.rect.right && y >= t.rect.top && y <= t.rect.bottom) ?? null;
        const card =
          phase === 'browse'
            ? targets.find(
                t =>
                  t.id.startsWith('focus:') &&
                  x >= t.rect.left &&
                  x <= t.rect.right &&
                  y >= t.rect.top &&
                  y <= t.rect.bottom,
              )
            : null;
        const indicated = hover ?? card;
        if (lastHover !== indicated?.id) {
          for (const t of targets) t.button.classList.toggle('hand-hover', t.id === indicated?.id);
          lastHover = indicated?.id ?? null;
        }
        const pressKey = `${primary.id}:${primary.observedAt}`,
          pressed = primary.pressed && !pinchHeld && pressKey !== lastPressedKey;
        if (primary.pressed) lastPressedKey = pressKey;
        pinchHeld = Boolean(primary.pinched);
        const hoverAction = phase === 'browse' && hover?.id === 'enter' ? null : (hover?.id ?? null),
          choice = dwell.update(hoverAction, now, { freshCapture: now - primary.observedAt < 300 });
        $('product-progress').style.strokeDashoffset = String(157 * (1 - choice.progress));
        // A pinch is an explicit choice and can address any visible card. Its
        // frame is consumed once even when rendering faster than the camera.
        const fire = choice.selected ?? (pressed && !latch ? (hover?.id ?? card?.id) : null);
        if (fire) {
          latch = indicated?.rect ?? null;
          action(fire);
          dwell.locked = fire;
        }
        const within = x > rect.left && x < rect.right && y > rect.top && y < rect.bottom;
        if (phase === 'browse' && !drag) {
          engaged = motionEngaged;
        } else if (!hover && showsModel() && within && !drag) {
          const name = world.pick(x, y, rect);
          $('product-part').textContent = name ?? '';
          $('product-part').hidden = !name;
        } else {
          control = null;
          zoomBase = null;
        }
      } else {
        dwell.reset();
        control = null;
        zoomBase = null;
        handId = null;
        if (orbit.hand) orbit.releaseHand(now);
        for (const t of targets) t.button.classList.remove('hand-hover');
        lastHover = null;
        if (now > mouseUntil) {
          world.clearHover();
          $('product-part').hidden = true;
        }
      }
      if (phase === 'browse') {
        const mouseSelecting = mouseEngaged && !drag && now < mouseUntil,
          idle = !present && !primary && !engaged && !drag && !mouseSelecting && now - lastAction > 5000;
        // rotationSeconds > 0 steps through the options while nobody is there; the grid never drifts.
        const rotationMs = (layoutOptions().rotationSeconds ?? 0) * 1000;
        if (!idle || !rotationMs) lastAdvance = now;
        else if (now - lastAdvance > rotationMs) {
          orbit.advance(1, now);
          lastAdvance = now;
        }
        orbitState = orbit.update(now, {
          engaged: engaged || mouseSelecting,
          freshCapture: engaged && now - primary.observedAt < 300,
          idle,
          idleDrift: !rotationMs && world.axis !== 'grid',
          reducedMotion,
        });
        const focused = items[orbitState.focus];
        $('orbit-name').textContent = focused.name;
        $('orbit-enter').setAttribute('aria-label', `Entrar en ${focused.name}`);
        $('orbit-progress').style.transform = `scaleX(${orbitState.progress})`;
        if (engaged) $('product-progress').style.strokeDashoffset = String(157 * (1 - orbitState.progress));
        $('orbit-hint').textContent =
          orbitState.intent === 'holding'
            ? `Mantén · ${focused.name}`
            : orbitState.intent === 'orienting'
              ? 'Gira la rueda.'
              : orbitState.intent === 'scrolling' || orbitState.intent === 'coasting'
                ? 'Detén la mano para elegir.'
                : LAYOUT_COPY[world.axis].hint;
        root.dataset.intent = orbitState.intent;
        root.classList.toggle('selection-holding', orbitState.intent === 'holding');
        world.setOrientation(orbitState.yaw);
        world.carousel(orbitState.angle, orbitState.focus, orbitState.progress, { dt, reducedMotion, idle });
        if (orbitState.enter) {
          lastAction = now;
          enter(focused.id);
          control = null;
          if (showsModel()) world.update({ dt, reducedMotion, idle: false });
        }
      } else if (showsModel())
        world.update({ dt, reducedMotion, idle: !present && !drag && now > mouseUntil && now - lastAction > 1500 });
      $('product-hint').textContent =
        control?.mode === 'two'
          ? 'Separa las manos para ampliar.'
          : control
            ? 'Tu movimiento lo transforma.'
            : 'Mueve la mano para girar.';
    },
    render() {
      if (!active || (phase === 'inspect' && !showsModel())) return;
      world.render(rect);
      if (phase === 'browse')
        for (const label of world.labels(rect)) {
          const b = root.querySelector(`[data-product-action="focus:${label.id}"]`);
          b.style.transform = `translate(${label.x}px,${label.y}px)`;
          b.style.width = `${label.width}px`;
          b.style.height = `${label.height}px`;
          b.style.visibility = label.visible ? 'visible' : 'hidden';
          b.tabIndex = label.visible ? 0 : -1;
          b.classList.toggle('front-option', label.front);
          b.style.zIndex = label.front ? '2' : '1';
          b.setAttribute('aria-pressed', String(label.front));
        }
    },
  };
}
