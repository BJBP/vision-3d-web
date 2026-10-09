// Screen coordinates are mirrored by server.py. No finger pose or identity inference.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BodyPointer {
  constructor() {
    this.reset();
  }
  reset() {
    this.side = null;
    this.point = null;
    this.time = -Infinity;
    this.bimanual = null;
  }
  sample(pose, time) {
    if (
      !pose ||
      !Array.isArray(pose.i) ||
      pose.i.length !== 66 ||
      !pose.i.every(Number.isFinite) ||
      !Array.isArray(pose.v) ||
      pose.v.length !== 33 ||
      ![11, 12, 23, 24].every(i => pose.v[i] > 0.6)
    ) {
      this.reset();
      return { mode: 'rest' };
    }
    if (time - this.time > 250) {
      this.point = null;
      this.side = null;
      this.bimanual = null;
    }
    const dt = clamp((time - this.time) / 1000, 0.001, 0.1);
    this.time = time;
    const x = i => pose.i[i * 2],
      y = i => pose.i[i * 2 + 1];
    const cx = (x(11) + x(12)) / 2,
      sy = (y(11) + y(12)) / 2,
      hy = (y(23) + y(24)) / 2;
    const width = Math.abs(x(11) - x(12)),
      height = hy - sy;
    if (width < 0.035 || height < 0.055) {
      this.reset();
      return { mode: 'rest' };
    }
    const raised = i => pose.v[i] > 0.65 && y(i) < hy - height * 0.2 && x(i) > 0 && x(i) < 1 && y(i) > 0 && y(i) < 1;
    const a = raised(15),
      b = raised(16);
    if (a && b && y(15) < hy - height * 0.4 && y(16) < hy - height * 0.4 && Math.abs(x(15) - x(16)) > width * 0.55) {
      this.point = null;
      this.side = null;
      return { mode: 'transform', spread: Math.abs(x(15) - x(16)) / width, center: ((x(15) + x(16)) / 2 - cx) / width };
    }
    if (!a && !b) {
      this.point = null;
      this.side = null;
      return { mode: 'rest' };
    }
    if (this.side === null || !raised(this.side)) {
      this.side = a && b ? (y(15) < y(16) ? 15 : 16) : a ? 15 : 16;
      this.point = null;
    }
    const target = {
      x: clamp(0.5 + (x(this.side) - cx) / (width * 2.8), 0.015, 0.985),
      y: clamp((y(this.side) - sy + height * 0.65) / (height * 1.5), 0.015, 0.985),
    };
    const k = 1 - Math.exp(-dt * 16);
    if (!this.point) this.point = target;
    else {
      this.point.x += (target.x - this.point.x) * k;
      this.point.y += (target.y - this.point.y) * k;
    }
    return { mode: 'point', ...this.point, side: this.side };
  }
}

export class DwellSelector {
  constructor(duration = 1100) {
    this.duration = duration;
    this.reset();
  }
  reset() {
    this.target = null;
    this.since = 0;
    this.last = -Infinity;
    this.locked = null;
  }
  update(target, now, { freshCapture = false } = {}) {
    const gap = now - this.last;
    if (gap > 250) {
      if (!freshCapture || !Number.isFinite(this.last)) {
        this.target = null;
        this.since = now;
      } else this.since += gap - 250; // Fresh capture can continue, never skip a hold.
    }
    this.last = now;
    if (!target) {
      this.target = null;
      this.locked = null;
      return { progress: 0, selected: null };
    }
    if (this.locked) return { progress: 0, selected: null };
    if (this.target !== target) {
      this.target = target;
      this.since = now;
    }
    const progress = clamp((now - this.since) / this.duration, 0, 1);
    if (progress === 1) {
      this.locked = target;
      return { progress: 1, selected: target };
    }
    return { progress, selected: null };
  }
}

export const SCENARIOS = {
  city: {
    title: 'Ciudad inteligente',
    short: 'Ciudad',
    subtitle: 'Espacios que conectan personas.',
    icon: '◈',
    color: 0x91eac5,
  },
  industry: {
    title: 'Industria conectada',
    short: 'Industria',
    subtitle: 'Una operación que evoluciona.',
    icon: '⬡',
    color: 0xe0bb85,
  },
  commerce: {
    title: 'Comercio del futuro',
    short: 'Comercio',
    subtitle: 'Experiencias que crean valor.',
    icon: '▦',
    color: 0x9cbce8,
  },
};
export const PRIORITIES = {
  energy: { title: 'Energía', detail: 'Activa infraestructura solar' },
  automation: { title: 'Automatización', detail: 'Conecta servicios y procesos' },
  capacity: { title: 'Capacidad', detail: 'Amplía el espacio disponible' },
};
export function createChoices(scenario = 'city') {
  return { scenario, energy: 0, automation: 0, capacity: 0 };
}
export function localProposal(choices) {
  const active = Object.keys(PRIORITIES).filter(k => choices[k] > 0);
  return {
    title: `${SCENARIOS[choices.scenario].title}: tu visión`,
    summary: active.length
      ? `Has combinado ${active.map(k => PRIORITIES[k].title.toLowerCase()).join(', ')} en un mismo espacio. Esta maqueta permite explorar cómo se relacionan tus decisiones.`
      : 'Un punto de partida para explorar nuevas conexiones entre espacio, tecnología y personas.',
    actions: active.length
      ? active.map(
          k =>
            ({
              energy: 'Validar la demanda energética y la superficie solar disponible.',
              automation: 'Elegir un proceso piloto y definir cómo medir su funcionamiento.',
              capacity: 'Contrastar el espacio propuesto con la demanda y la operación real.',
            })[k],
        )
      : ['Seleccionar una prioridad y transformar la maqueta.'],
    tradeoff: 'Es una propuesta conceptual. Los costes y el impacto requieren datos y evaluación del proyecto.',
    recipe: { ...choices },
  };
}
