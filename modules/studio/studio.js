// Estudio gestual: el visitante elige opciones con el cuerpo (puntero y permanencia)
// y recibe una propuesta local o generada. createStudio({enabled}).
import { BodyPointer, DwellSelector, SCENARIOS, PRIORITIES, createChoices, localProposal } from '../tracking/index.js';
import { createStudioWorld } from './studio-world.js';
import { HandInput } from '../tracking/index.js';

export function createStudio({ enabled = true, onChange = () => {} } = {}) {
  const root = document.createElement('section');
  root.id = 'studio';
  root.hidden = true;
  root.setAttribute('aria-label', 'Crea con tus manos');
  root.innerHTML = `<div class="studio-heading"><div class="eyebrow">CREA CON TUS MANOS <span class="studio-live">INTERACTIVO</span></div><h2 id="studio-title">Dale forma <br>al <i>futuro.</i></h2><p id="studio-subtitle">Levanta una mano y elige dónde empezar.</p></div>
    <div id="studio-world" aria-label="Maqueta tridimensional conceptual"></div>
    <div class="studio-world-label"><span id="studio-world-name">CIUDAD INTELIGENTE</span><span>MAQUETA CONCEPTUAL · SIN MÉTRICAS REALES</span></div>
    <div id="studio-choices" class="studio-choices"></div>
    <div class="studio-actions"><button type="button" data-studio-action="back" id="studio-back" hidden>↶ Cambiar escenario</button><button type="button" data-studio-action="proposal" id="studio-propose" hidden>Crear mi propuesta <span>↗</span></button></div>
    <div class="studio-instruction"><span class="gesture-symbol" aria-hidden="true">◎</span><div><strong id="studio-hint">Una mano para elegir.</strong><span id="studio-detail">Señala una tarjeta. Mantén la posición hasta completar el círculo.</span></div><span class="studio-input-mode" id="studio-input-mode">MOVIMIENTO EN VIVO</span></div>
    <div class="studio-result" id="studio-result" hidden aria-live="polite"><span id="studio-result-source" class="eyebrow"></span><h3 id="studio-result-title"></h3><p id="studio-result-summary"></p><ol id="studio-result-actions"></ol><p id="studio-result-tradeoff" class="studio-result-note"></p><div class="result-controls"><button type="button" data-studio-action="apply" id="studio-apply" hidden>Ver esta configuración ↗</button><button type="button" data-studio-action="close">Volver a mi maqueta ↶</button></div></div>
    <div id="studio-cursor" hidden aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="cursor-track" cx="32" cy="32" r="26"/><circle id="studio-progress" cx="32" cy="32" r="26"/></svg><span>✦</span></div>
    <div id="studio-tracking" hidden role="status">Vuelve a colocarte frente a la cámara.</div>`;
  document.body.append(root);
  const $ = id => document.getElementById(id),
    world = createStudioWorld(),
    pointer = new BodyPointer(),
    dwell = new DwellSelector();
  const handPointer = new HandInput();
  let choices = createChoices(),
    phase = 'choose',
    input = { mode: 'rest' },
    inputTime = -Infinity,
    active = false,
    lostAt = null;
  let lastDemo = null,
    demoStart = 0,
    demoStage = -1,
    manualDemo = false,
    transformBase = null,
    yaw = 0,
    zoom = 1;
  let targets = [],
    worldRect = null,
    lastLayout = 0,
    requestNumber = 0,
    abort = null,
    pending = false,
    result = null,
    source = 'local';
  let lastInputMode = '',
    lastHover = null,
    handSide = null,
    latchRect = null;
  const state = () => ({
    enabled,
    active,
    phase,
    choices: { ...choices },
    input: input.mode,
    cursor: input.mode === 'point' ? { x: input.x, y: input.y } : null,
    pending,
    source,
    zoom,
    yaw,
  });
  function layout() {
    worldRect = $('studio-world').getBoundingClientRect();
    targets = [...root.querySelectorAll('[data-studio-action]')]
      .filter(b => !b.hidden && !b.disabled && b.getClientRects().length && (!result || b.closest('.studio-result')))
      .map(b => ({ id: b.dataset.studioAction, button: b, rect: b.getBoundingClientRect() }));
  }
  function renderChoices() {
    const container = $('studio-choices');
    container.replaceChildren();
    const items = phase === 'choose' ? SCENARIOS : PRIORITIES;
    for (const [id, data] of Object.entries(items)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.studioAction = `${phase === 'choose' ? 'scenario' : 'priority'}:${id}`;
      const number = document.createElement('span');
      number.className = 'choice-number';
      number.textContent = phase === 'choose' ? data.icon : '0' + choices[id];
      const title = document.createElement('strong');
      title.textContent = phase === 'choose' ? data.short : data.title;
      const description = document.createElement('span');
      description.className = 'choice-description';
      description.textContent = phase === 'choose' ? data.subtitle : data.detail;
      const level = document.createElement('span');
      level.className = 'choice-level';
      level.textContent =
        phase === 'choose'
          ? 'MANTÉN PARA ELEGIR'
          : Array.from({ length: 3 }, (_, i) => (i < choices[id] ? '●' : '○')).join(' ');
      button.append(number, title, description, level);
      container.append(button);
    }
    $('studio-title').innerHTML =
      phase === 'choose' ? 'Dale forma <br>al <i>futuro.</i>' : 'Tu visión. <br><i>En tus manos.</i>';
    $('studio-subtitle').textContent =
      phase === 'choose'
        ? 'Levanta una mano y elige dónde empezar.'
        : `${SCENARIOS[choices.scenario].title}. Elige qué quieres transformar.`;
    $('studio-world-name').textContent = SCENARIOS[choices.scenario].title.toUpperCase();
    $('studio-back').hidden = $('studio-propose').hidden = phase === 'choose';
    world.set(choices, phase === 'choose');
    layout();
    onChange(state());
  }
  function closeResult() {
    result = null;
    pending = false;
    $('studio-result').hidden = true;
    root.classList.remove('showing-result');
    layout();
  }
  function cancelRequest() {
    requestNumber++;
    abort?.abort();
    abort = null;
    pending = false;
  }
  function reset() {
    cancelRequest();
    closeResult();
    choices = createChoices();
    phase = 'choose';
    yaw = 0;
    zoom = 1;
    world.transform(yaw, zoom);
    pointer.reset();
    dwell.reset();
    latchRect = null;
    input = { mode: 'rest' };
    transformBase = null;
    renderChoices();
  }
  function showResult(data, label) {
    result = data;
    source = label;
    pending = false;
    $('studio-result').hidden = false;
    root.classList.add('showing-result');
    $('studio-result-source').textContent =
      label === 'codex'
        ? 'PROPUESTA GENERADA POR CODEX'
        : label === 'working'
          ? 'PREPARANDO TU PROPUESTA'
          : 'PROPUESTA LOCAL · CONTENIDO PREPARADO';
    $('studio-result-title').textContent = data.title;
    $('studio-result-summary').textContent = data.summary;
    const list = $('studio-result-actions');
    list.replaceChildren();
    for (const line of data.actions) {
      const li = document.createElement('li');
      li.textContent = line;
      list.append(li);
    }
    $('studio-result-tradeoff').textContent = data.tradeoff;
    $('studio-apply').hidden = !data.recipe || label === 'working';
    layout();
    onChange(state());
  }
  async function propose(isDemo) {
    if (pending) return;
    const current = { ...choices },
      id = ++requestNumber;
    abort = new AbortController();
    if (isDemo) {
      showResult(localProposal(current), 'local');
      return;
    }
    showResult(
      {
        title: 'De tus gestos a una propuesta.',
        summary: 'Tu maqueta sigue disponible. Estamos preparando una idea a partir de tus elecciones.',
        actions: [],
        tradeoff: 'Puedes volver a tu maqueta cuando quieras.',
      },
      'working',
    );
    pending = true;
    const fallback = () => {
      if (id === requestNumber) showResult(localProposal(current), 'local');
    };
    // A static preview also works: capability probing avoids POST errors without a bridge.
    try {
      const capability = await fetch('./api/studio/status', { signal: abort.signal });
      if (!capability.ok) {
        fallback();
        return;
      }
      const available = await capability.json();
      if (!available.codex) {
        fallback();
        return;
      }
      const res = await fetch('./api/studio/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vision-Studio': '1' },
        body: JSON.stringify(current),
        signal: abort.signal,
      });
      if (!res.ok) throw new Error('Bridge unavailable');
      const job = await res.json(),
        start = performance.now();
      while (id === requestNumber && performance.now() - start < 125000) {
        const update = await fetch(`./api/studio/proposals/${encodeURIComponent(job.id)}`, { signal: abort.signal });
        if (!update.ok) throw new Error('Job unavailable');
        const info = await update.json();
        if (info.status === 'done') {
          if (id === requestNumber) showResult(info.result, info.source === 'codex' ? 'codex' : 'local');
          return;
        }
        if (info.status === 'failed') throw new Error('Generation failed');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      fallback();
    } catch {
      fallback();
    }
  }
  function action(id, fromDemo = false) {
    if (!fromDemo && lastDemo) manualDemo = true;
    if (id.startsWith('scenario:')) {
      choices = createChoices(id.split(':')[1]);
      phase = 'build';
      closeResult();
      world.reveal();
      renderChoices();
    } else if (id.startsWith('priority:')) {
      const key = id.split(':')[1];
      choices[key] = (choices[key] + 1) % 4;
      renderChoices();
    } else if (id === 'back') {
      reset();
    } else if (id === 'proposal') {
      void propose(lastDemo);
    } else if (id === 'close') {
      cancelRequest();
      closeResult();
    } else if (id === 'apply' && result?.recipe) {
      choices = { ...result.recipe };
      phase = 'build';
      closeResult();
      renderChoices();
    }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-studio-action]');
    if (button && !button.disabled) action(button.dataset.studioAction);
  });
  renderChoices();
  addEventListener('resize', layout);
  function hint(mode, demo) {
    const key = mode + ':' + demo + ':' + phase + ':' + !!result;
    if (key === lastInputMode) return;
    lastInputMode = key;
    $('studio-input-mode').textContent = demo ? 'RECORRIDO SIMULADO' : 'MOVIMIENTO EN VIVO';
    const transforming = mode === 'transform' && phase === 'build' && !result;
    $('studio-hint').textContent = transforming
      ? 'Tu maqueta responde a las dos manos.'
      : result
        ? 'Señala una acción para continuar.'
        : mode === 'transform'
          ? 'Baja una mano para elegir.'
          : 'Una mano para elegir.';
    $('studio-detail').textContent = transforming
      ? 'Sepáralas para ampliar. Muévelas juntas de lado para girar.'
      : phase === 'choose'
        ? 'Señala una tarjeta. Mantén la posición hasta completar el círculo.'
        : 'Mantén una tarjeta para cambiarla. Levanta las dos manos para ampliar o girar.';
  }
  return {
    state,
    toggle() {
      enabled = !enabled;
      if (!enabled) reset();
      onChange(state());
    },
    ingest(pose, time, hands = []) {
      const points = handPointer.sample(pose, hands, time),
        finger = points.filter(p => p.source === 'fingers');
      input = pointer.sample(pose, time);
      const hasBodyAnchors = [11, 12, 23, 24].every(i => pose?.v?.[i] > 0.6);
      if (finger.length || (input.mode === 'rest' && !hasBodyAnchors)) {
        if (points.length === 2) {
          const scale = (points[0].scale + points[1].scale) / 2;
          input = {
            mode: 'transform',
            spread: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / scale,
            center: ((points[0].x + points[1].x) / 2 - 0.5) / scale,
          };
        } else if (points.length) {
          const p = points[0];
          input = { mode: 'point', x: p.sx, y: p.sy, side: p.id, pressed: p.pressed };
        }
      }
      inputTime = time;
    },
    update({ now, dt, present, demo, reducedMotion, blocked = false }) {
      if (lastDemo !== demo) {
        reset();
        lastDemo = demo;
        demoStart = now;
        demoStage = -1;
        manualDemo = false;
      }
      const hasInput = now - inputTime < 220 && input.mode !== 'rest';
      active = enabled && (present || hasInput);
      root.hidden = !enabled;
      document.body.classList.toggle('studio-active', active);
      root.classList.toggle('active', active);
      if (!enabled) {
        $('studio-cursor').hidden = true;
        return;
      }
      if (!present && !hasInput) {
        if (demo && !manualDemo) demoStart = now;
        if (lostAt === null) lostAt = now;
        if (now - lostAt > 12000 && (phase !== 'choose' || result)) reset();
        $('studio-tracking').hidden = phase === 'choose';
        dwell.reset();
        $('studio-cursor').hidden = true;
        return;
      }
      lostAt = null;
      $('studio-tracking').hidden = true;
      if (now - lastLayout > 350) {
        layout();
        lastLayout = now;
      }
      if (demo && !manualDemo) {
        const elapsed = (now - demoStart) / 1000;
        const step = elapsed < 5 ? 0 : elapsed < 10 ? 1 : elapsed < 15 ? 2 : elapsed < 20 ? 3 : elapsed < 27 ? 4 : 5;
        if (step !== demoStage) {
          demoStage = step;
          if (step === 1) action('scenario:city', true);
          if (step === 2) action('priority:energy', true);
          if (step === 3) action('priority:automation', true);
          if (step === 4) action('priority:capacity', true);
          if (step === 5) {
            demoStart = now;
            reset();
          }
        }
        hint('rest', true);
        $('studio-cursor').hidden = true;
        dwell.reset();
        if (!reducedMotion) {
          yaw = Math.sin(elapsed * 0.13) * 0.32;
          world.transform(yaw, zoom);
        }
        return;
      }
      const fresh = !demo && now - inputTime < 220 && !blocked;
      const control = fresh ? input : { mode: 'rest' };
      hint(control.mode, demo);
      $('studio-cursor').hidden = control.mode !== 'point';
      if (control.mode === 'transform' && phase === 'build' && !result) {
        dwell.reset();
        if (!transformBase) transformBase = { ...control, yaw, zoom };
        yaw = transformBase.yaw + (control.center - transformBase.center) * 1.7;
        zoom = Math.max(0.7, Math.min(1.3, (transformBase.zoom * control.spread) / transformBase.spread));
        world.transform(yaw, zoom);
        return;
      }
      transformBase = null;
      let hover = null;
      if (control.mode === 'point') {
        if (handSide !== control.side) {
          dwell.reset();
          handSide = control.side;
        }
        const x = control.x * innerWidth,
          y = control.y * innerHeight;
        // Release by leaving the selected rectangle, even if a slow frame skips
        // the narrow gap between cards. A new layout under a still hand stays locked.
        if (
          latchRect &&
          (x < latchRect.left - 8 || x > latchRect.right + 8 || y < latchRect.top - 8 || y > latchRect.bottom + 8)
        ) {
          dwell.update(null, now);
          latchRect = null;
        }
        $('studio-cursor').style.transform = `translate(${x}px,${y}px)`;
        hover =
          targets.find(({ rect, id }) => {
            const pad = lastHover === id ? 8 : 0;
            return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
          })?.id ?? null;
      }
      const selection = dwell.update(hover, now);
      $('studio-progress').style.strokeDashoffset = String(164 * (1 - selection.progress));
      if (lastHover !== hover) {
        for (const { button, id } of targets) button.classList.toggle('gesture-hover', id === hover);
        lastHover = hover;
      }
      const selected = control.pressed && hover ? hover : selection.selected;
      input.pressed = false;
      if (selected) {
        dwell.locked = selected;
        latchRect = targets.find(t => t.id === selected)?.rect ?? null;
        action(selected);
      }
    },
    render(renderer, timing) {
      if (worldRect) world.render(renderer, worldRect, { ...timing, active: active && !result });
    },
  };
}
