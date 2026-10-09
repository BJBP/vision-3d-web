// Reloj de pulsera y logo HT hechos de partículas (puntos en ~[-2.4, 2.4]).

const TAU = Math.PI * 2;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const gauss = () => {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
};

// ---------- Reloj ----------
// Las partículas con i % 100 < 14 forman las agujas; su posición la calcula la GPU con la hora real.
export const isClockHand = i => i % 100 < 14;

export function clockHandAttr(n) {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (!isClockHand(i)) continue;
    const k = i % 100;
    const id = k < 5 ? 1 : k < 10 ? 2 : 3; // hora, minuto, segundo
    a.set([id, Math.pow(Math.random(), id === 3 ? 1 : 0.8), rnd(-1, 1)], i * 3);
  }
  return a;
}

// Misma geometría que clockPos() del shader (app.js): mantener ambas iguales.
// [largo, ancho, z, cola]
const HAND = { 1: [0.7, 0.07, 0.07, -0.1], 2: [1.05, 0.05, 0.1, -0.12], 3: [1.18, 0.013, 0.13, -0.28] };
export function clockHandPos(id, t, off, ang) {
  const [L, W, Z, T] = HAND[id];
  const a = ang[id - 1];
  const along = T + (L - T) * t;
  const lat = off * W * (id < 3 ? 1 - 0.6 * t : 1);
  return [lat * Math.cos(a) + along * Math.sin(a), -lat * Math.sin(a) + along * Math.cos(a), Z + off * 0.015];
}

// Recorrido del brazalete alrededor de la muñeca: elipse en el plano YZ.
// La caja queda al frente (z≈0) y el brazalete sale por las asas y da la vuelta por detrás.
const BAND = { A: 2.3, B: 1.7, zc: -1.2, phi0: 0.9, width: 1.05, thick: 0.13 };
function bandPoint(phi) {
  const { A, B, zc } = BAND;
  const y = A * Math.sin(phi),
    z = zc + B * Math.cos(phi);
  const nx = Math.sin(phi) / A,
    nz = Math.cos(phi) / B,
    l = Math.hypot(nx, nz); // normal hacia afuera
  return [y, z, nx / l, nz / l];
}

// Píxeles del logo HT: disco verde y letras blancas, en coordenadas centradas y normalizadas (radio ≈ 1)
export function logoPixels(img) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  // 1) el disco: píxeles opacos no blancos
  const solid = k => d[k + 3] >= 128 && !(d[k] > 200 && d[k + 1] > 200 && d[k + 2] > 200);
  let minX = S,
    maxX = 0,
    minY = S,
    maxY = 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (solid((y * S + x) * 4)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2,
    r = Math.max(maxX - minX, maxY - minY) / 2;
  // 2) las letras: dentro del círculo pero no verdes (en el PNG vienen recortadas/transparentes)
  const disc = [],
    letters = [];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const nx = (x - cx) / r,
        ny = -(y - cy) / r;
      if (nx * nx + ny * ny > 0.97) continue;
      (solid((y * S + x) * 4) ? disc : letters).push(nx, ny);
    }
  return { disc: Float32Array.from(disc), letters: Float32Array.from(letters) };
}
const pick = arr => {
  const k = Math.floor(Math.random() * (arr.length / 2)) * 2;
  return [arr[k], arr[k + 1]];
};

// Logo HT como moneda 3D de partículas: disco verde (tinte 1) y letras blancas en relieve
export function logoCoin(n, logo) {
  const pos = new Float32Array(n * 3),
    tint = new Float32Array(n);
  const R = 2.0;
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    let p;
    if (u < 0.4) {
      // letras en relieve, al frente
      const [x, y] = pick(logo.letters);
      p = [x * R, y * R, rnd(0.08, 0.16)];
    } else if (u < 0.82) {
      // cara del disco
      const [x, y] = pick(logo.disc);
      p = [x * R, y * R, gauss() * 0.01];
      tint[i] = 1;
    } else if (u < 0.92) {
      // canto de la moneda
      const th = rnd(0, TAU);
      p = [Math.cos(th) * R, Math.sin(th) * R, rnd(-0.2, 0.02)];
      tint[i] = 1;
    } else {
      // reverso tenue
      const [x, y] = pick(logo.disc);
      p = [x * R, y * R, -0.2];
      tint[i] = 1;
    }
    pos.set(p, i * 3);
  }
  return { pos, tint };
}

function dialPixels() {
  const S = 1024,
    C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = g.strokeStyle = '#fff';
  for (let k = 0; k < 60; k++) {
    // pista de minutos
    const a = (k / 60) * TAU;
    g.lineWidth = k % 5 === 0 ? 7 : 3;
    g.beginPath();
    g.moveTo(C + Math.sin(a) * 440, C - Math.cos(a) * 440);
    g.lineTo(C + Math.sin(a) * 470, C - Math.cos(a) * 470);
    g.stroke();
  }
  for (let h = 0; h < 12; h++) {
    // índices de bastón (doble a las 12)
    if (h === 3) continue; // ventana de fecha
    const a = (h / 12) * TAU;
    for (const off of h === 0 ? [-16, 16] : [0]) {
      g.save();
      g.translate(C + Math.sin(a) * 360, C - Math.cos(a) * 360);
      g.rotate(a);
      g.fillRect(-11 + off, -52, 22, 104);
      g.restore();
    }
  }
  g.lineWidth = 6; // ventana de fecha a las 3
  g.strokeRect(C + 300, C - 34, 96, 68);
  g.font = `700 50px "Ubuntu", "Inter", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(new Date().getDate()), C + 348, C + 3);
  const data = g.getImageData(0, 0, S, S).data;
  const px = [];
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) if (data[(y * S + x) * 4 + 3] > 128) px.push(x, y);
  return { px, C, scale: 1.3 / 470 };
}

function wristwatch(n, logo) {
  const a = new Float32Array(n * 3),
    tint = new Float32Array(n);
  const dial = dialPixels();
  const RC = 1.42; // radio de la caja
  const { phi0, width, thick } = BAND;
  const links = 30,
    phiSpan = TAU - 2 * phi0;
  for (let i = 0; i < n; i++) {
    if (isClockHand(i)) continue; // las agujas las pone la GPU
    const u = Math.random();
    let p;
    if (u < 0.045) {
      // logo HT en la esfera, bajo las 12
      const letter = Math.random() < 0.45;
      const [x, y] = pick(letter ? logo.letters : logo.disc);
      p = [x * 0.3, 0.52 + y * 0.3, letter ? 0.02 : 0.005];
      if (!letter) tint[i] = 1;
    } else if (u < 0.2) {
      // esfera: índices, pista de minutos y fecha
      const k = Math.floor(Math.random() * (dial.px.length / 2)) * 2;
      p = [(dial.px[k] - dial.C) * dial.scale, -(dial.px[k + 1] - dial.C) * dial.scale, gauss() * 0.008];
    } else if (u < 0.25) {
      // fondo de la esfera, tenue
      const r = Math.sqrt(Math.random()) * 1.33,
        th = rnd(0, TAU);
      p = [Math.sin(th) * r, Math.cos(th) * r, -0.03];
    } else if (u < 0.36) {
      // bisel acanalado
      const th = rnd(0, TAU),
        ph = rnd(0, Math.PI);
      const rr = 0.09 * (1 + 0.12 * Math.max(0, Math.sin(th * 60)));
      p = [Math.sin(th) * (RC + Math.cos(ph) * rr), Math.cos(th) * (RC + Math.cos(ph) * rr), 0.06 + Math.sin(ph) * rr];
    } else if (u < 0.45) {
      // canto de la caja
      const th = rnd(0, TAU);
      p = [Math.sin(th) * (RC + 0.05), Math.cos(th) * (RC + 0.05), rnd(-0.32, 0.04)];
    } else if (u < 0.5) {
      // asas: unen la caja con el brazalete
      const sx = Math.random() < 0.5 ? -1 : 1,
        sy = Math.random() < 0.5 ? -1 : 1;
      const t = Math.random();
      p = [sx * (width / 2 - rnd(0, 0.16)), sy * (1.2 + t * 0.62), -t * 0.28 + rnd(-0.1, 0.02)];
    } else if (u < 0.53) {
      // corona a las 3, estriada
      const th = rnd(0, TAU),
        r = 0.15 * (1 + 0.08 * Math.sign(Math.sin(th * 14)));
      p = [RC + 0.1 + rnd(0, 0.22), Math.cos(th) * r, -0.1 + Math.sin(th) * r];
    } else {
      // brazalete: 30 eslabones de 3 piezas, con ranuras entre ellos
      const k = Math.floor(Math.random() * links);
      const f = rnd(0.06, 0.94);
      const [y, z, ny, nz] = bandPoint(phi0 + ((k + f) / links) * phiSpan);
      let x = rnd(-width / 2, width / 2);
      const center = Math.abs(x) < width / 6;
      if (Math.abs(Math.abs(x) - width / 6) < 0.025) x += Math.sign(x || 1) * 0.05; // ranura entre piezas
      const surf = Math.random();
      let t;
      if (surf < 0.7)
        t = thick + (center ? 0.025 : 0) * Math.sin(f * Math.PI); // cara exterior abombada
      else if (surf < 0.85)
        t = 0; // cara interior
      else {
        t = rnd(0, thick);
        x = (Math.sign(x || 1) * width) / 2;
      } // cantos
      p = [x, y + ny * t, z + nz * t];
    }
    a.set(p, i * 3);
  }
  return { pos: a, tint };
}

export function buildShapes(n, logoImg) {
  const logo = logoPixels(logoImg);
  return { watch: wristwatch(n, logo), coin: logoCoin(n, logo) };
}
