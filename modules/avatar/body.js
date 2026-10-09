// Facial/hand surfaces and particles share anatomical deformation parameters.
// The continuous body surface is baked separately by tools/build_anatomy.py.
// Coordinates are metres; MediaPipe joints keep the public wire protocol unchanged.
export const HAND_A = 33,
  HAND_B = 54,
  MID_S = 75,
  MID_H = 76,
  HEAD = 77,
  NECK = 78,
  JOINTS = 80;
export const KIND = { CAPSULE: 0, TORSO: 1, HEAD: 2, BAND: 3, FACE: 4, PALM: 6, EYE: 7 };
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
let seed = 74819;
const rnd = () => {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
  return seed / 4294967296;
};

// Broad deltoids, tapering wrists, quadriceps and calves. Last value controls muscle belly.
const LIMBS = [
  [11, 13, 0.062, 0.04, 2600, 0.22],
  [12, 14, 0.062, 0.04, 2600, 0.22],
  [13, 15, 0.04, 0.023, 2000, 0.25],
  [14, 16, 0.04, 0.023, 2000, 0.25],
  [23, 25, 0.086, 0.05, 3000, 0.16],
  [24, 26, 0.086, 0.05, 3000, 0.16],
  [25, 27, 0.05, 0.029, 2300, 0.3],
  [26, 28, 0.05, 0.029, 2300, 0.3],
  [27, 31, 0.037, 0.029, 750, 0.06],
  [28, 32, 0.037, 0.029, 750, 0.06],
  [MID_S, NECK, 0.047, 0.043, 900, 0.02],
];
const FINGERS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [5, 6],
  [6, 7],
  [7, 8],
  [9, 10],
  [10, 11],
  [11, 12],
  [13, 14],
  [14, 15],
  [15, 16],
  [17, 18],
  [18, 19],
  [19, 20],
];

// Sculpted neutral face. A coherent synthetic material avoids a skin/eye realism mismatch.
function facePoint(u, v) {
  const theta = u * TAU,
    phi = v * Math.PI;
  const y = Math.cos(phi),
    r = Math.sin(phi),
    x = r * Math.cos(theta),
    front = Math.sin(theta);
  const jaw = 1 - 0.25 * gauss(y, -0.72, 0.36) - 0.08 * gauss(y, 0.86, 0.23);
  let z = r * front * 0.88;
  const mask = Math.max(0, front) ** 8;
  const eyes = gauss(x, 0.37, 0.22) + gauss(x, -0.37, 0.22);
  z +=
    mask *
    (0.16 * gauss(x, 0, 0.13) * gauss(y, 0.1, 0.42) + // nasal bridge
      0.32 * gauss(x, 0, 0.17) * gauss(y, -0.15, 0.16) + // nose tip
      0.085 * (gauss(x, 0.17, 0.085) + gauss(x, -0.17, 0.085)) * gauss(y, -0.23, 0.085) +
      -0.13 * eyes * gauss(y, 0.15, 0.12) + // orbital recess
      0.08 * eyes * gauss(y, 0.3, 0.095) + // supraorbital ridge
      0.085 * (gauss(x, 0.57, 0.2) + gauss(x, -0.57, 0.2)) * gauss(y, -0.13, 0.2) +
      0.085 * gauss(x, 0, 0.32) * gauss(y, -0.43, 0.085) + // lips
      -0.036 * gauss(x, 0, 0.31) * gauss(y, -0.435, 0.016) +
      0.09 * gauss(x, 0, 0.4) * gauss(y, -0.72, 0.16));
  return [x * jaw, y * 1.32, z];
}
function faceNormal(u, v) {
  const e = 0.0001,
    a = facePoint(u - e, v),
    b = facePoint(u + e, v),
    c = facePoint(u, Math.max(0.00001, v - e)),
    d = facePoint(u, Math.min(0.99999, v + e));
  const U = b.map((x, i) => x - a[i]),
    V = d.map((x, i) => x - c[i]);
  const n = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
  const l = Math.hypot(...n) || 1;
  return n.map(x => x / l);
}

const smooth = (a, b, t) => {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function torsoPoint(u, v) {
  const t = mix(-0.11, 1.19, v),
    th = u * TAU;
  let width;
  if (t < 0.12) width = mix(0.3, 1.03, smooth(-0.11, 0.12, t));
  else if (t < 0.35) width = mix(1.03, 0.92, smooth(0.12, 0.35, t));
  else if (t < 0.68) width = mix(0.92, 0.73, smooth(0.35, 0.68, t));
  else if (t < 0.91) width = mix(0.73, 0.88, smooth(0.68, 0.91, t));
  else width = mix(0.88, 0.025, smooth(0.91, 1.19, t));
  const x = Math.cos(th) * width * 0.192;
  let depth = 0.09 + 0.019 * gauss(t, 0.23, 0.2) - 0.01 * gauss(t, 0.62, 0.2);
  depth *= mix(0.5, 1, smooth(-0.11, 0.08, t)) * (1 - 0.9 * smooth(0.96, 1.19, t));
  const front = Math.max(0, Math.sin(th)) ** 6;
  const chest = (gauss(x, 0.082, 0.065) + gauss(x, -0.082, 0.065)) * 0.013 * gauss(t, 0.24, 0.12);
  const clavicle = 0.008 * gauss(t, 0.065 + Math.abs(x) * 0.2, 0.024);
  const sternum = -0.005 * gauss(x, 0, 0.016) * gauss(t, 0.3, 0.21);
  const abdomen = 0.004 * gauss(x, 0, 0.08) * gauss(t, 0.62, 0.18);
  const z = Math.sin(th) * depth + front * (chest + clavicle + sternum + abdomen);
  return [x, (1 - t) * 0.514, z];
}
function torsoNormal(u, v) {
  const e = 0.0001,
    a = torsoPoint(u - e, v),
    b = torsoPoint(u + e, v),
    c = torsoPoint(u, v - e),
    d = torsoPoint(u, v + e);
  const U = b.map((x, i) => x - a[i]),
    V = d.map((x, i) => x - c[i]);
  const n = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]],
    l = Math.hypot(...n) || 1;
  return n.map(x => x / l);
}

export function buildBody() {
  seed = 74819;
  const particles = { J: [], P: [], R: [], N: [] },
    surface = { J: [], P: [], R: [], N: [], indices: [] };
  const vertex = (dst, a, b, kind, p, r = [0, 0], n = [0, 0, 1]) => {
    dst.J.push(a, b, kind);
    dst.P.push(...p);
    dst.R.push(...r);
    dst.N.push(...n);
  };
  const grid = (nu, nv, fn) => {
    const start = surface.J.length / 3;
    for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) fn(surface, u / nu, v / nv);
    for (let v = 0; v < nv; v++)
      for (let u = 0; u < nu; u++) {
        const a = start + v * (nu + 1) + u,
          b = a + 1,
          c = a + nu + 1,
          d = c + 1;
        surface.indices.push(a, b, c, b, d, c);
      }
  };
  const sample = (n, fn) => {
    for (let i = 0; i < n; i++) fn(particles, rnd(), rnd());
  };
  for (const [a, b, r0, r1, count, muscle] of LIMBS) {
    const fn = (dst, u, v) => vertex(dst, a, b, 0, [mix(-0.065, 1.065, v), u * TAU, 1, muscle], [r0, r1]);
    grid(28, 22, fn);
    sample(count, fn);
  }
  const torso = (dst, u, v) => {
    const [x, y, z] = torsoPoint(u, v);
    vertex(dst, 0, 0, 1, [x, 1 - y / 0.514, z, 0], [0, 0], torsoNormal(u, v));
  };
  grid(72, 64, torso);
  sample(13000, torso);
  // Rounded joints overlap adjacent surfaces, avoiding cut pipe ends in a bent pose.
  for (const [joint, rx, ry, rz] of [
    [11, 0.064, 0.067, 0.061],
    [12, 0.064, 0.067, 0.061],
    [13, 0.039, 0.041, 0.039],
    [14, 0.039, 0.041, 0.039],
    [23, 0.081, 0.086, 0.08],
    [24, 0.081, 0.086, 0.08],
    [25, 0.049, 0.052, 0.048],
    [26, 0.049, 0.052, 0.048],
    [27, 0.029, 0.035, 0.03],
    [28, 0.029, 0.035, 0.03],
  ]) {
    const fn = (dst, u, v) => {
      const th = u * TAU,
        ph = v * Math.PI,
        n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      vertex(dst, joint, 0, 8, [n[0] * rx, n[1] * ry, n[2] * rz, 0], [0, 0], n);
    };
    grid(24, 16, fn);
    sample(250, fn);
  }
  const head = (dst, u, v) => vertex(dst, 0, 0, 2, [...facePoint(u, v), 0], [0, 0], faceNormal(u, v));
  grid(96, 64, head);
  sample(11500, (dst, u, v) => head(dst, u, Math.acos(1 - 2 * v) / Math.PI));
  // Ears, eye surfaces and irises are part of the same head orientation.
  const ellipsoid = (center, scale, tone, count) => {
    const fn = (dst, u, v) => {
      const a = u * TAU,
        b = v * Math.PI,
        n = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)];
      vertex(dst, 0, 0, 7, [...n.map((x, i) => center[i] + x * scale[i]), tone], [0, 0], n);
    };
    grid(24, 14, fn);
    sample(count, fn);
  };
  for (const side of [-1, 1]) {
    ellipsoid([side * 0.96, -0.025, -0.01], [0.115, 0.255, 0.125], 0, 450);
    ellipsoid([side * 0.365, 0.19, 0.805], [0.19, 0.07, 0.055], 1, 160);
    ellipsoid([side * 0.365, 0.19, 0.859], [0.055, 0.053, 0.009], 2, 75);
    ellipsoid([side * 0.35, 0.211, 0.869], [0.014, 0.013, 0.005], 3, 15);
  }
  for (const base of [HAND_A, HAND_B]) {
    for (const [a, b] of FINGERS) {
      const radius = a < 4 ? 0.009 : 0.008;
      const fn = (dst, u, v) =>
        vertex(dst, base + a, base + b, 0, [mix(-0.065, 1.065, v), u * TAU, 1, 0.035], [radius, radius * 0.81]);
      grid(10, 5, fn);
      sample(90, fn);
    }
    // Full palm surface, wrist to the four knuckles; rounded elliptical cross section.
    const fn = (dst, u, v) => vertex(dst, base, 0, 6, [v, u * TAU, 1, 0]);
    grid(20, 12, fn);
    sample(950, fn);
  }
  // Fine metallic watchband and dial remain attached to the wrist.
  sample(500, (dst, u, v) => vertex(dst, 13, 15, 3, [mix(0.82, 0.95, v), u * TAU, 1, 0], [0.03, 0.03]));
  sample(450, (dst, u, v) => vertex(dst, 13, 15, 4, [v < 0.6 ? 1 : Math.sqrt(v), u * TAU, 0, 0]));
  const typed = d => ({
    aJ: new Float32Array(d.J),
    aP: new Float32Array(d.P),
    aR: new Float32Array(d.R),
    aN: new Float32Array(d.N),
  });
  const n = particles.J.length / 3;
  return {
    n,
    ...typed(particles),
    aRand: Float32Array.from({ length: n }, rnd),
    mesh: { ...typed(surface), index: new Uint32Array(surface.indices) },
  };
}

export const DEFORM_GLSL = /* glsl */ `
  vec3 safeUnit(vec3 v, vec3 fallback) { float l=length(v); return l>0.0001 ? v/l : fallback; }
  void basis(vec3 d, out vec3 u, out vec3 v) {
    vec3 axis=abs(d.y)<0.95?vec3(0.,1.,0.):vec3(1.,0.,0.);
    u=safeUnit(cross(d,axis),vec3(1.,0.,0.)); v=cross(d,u);
  }
  void anatomy(out vec3 pos,out vec3 n,out float vis,out float tone) {
    int a=int(aJ.x+.5),b=int(aJ.y+.5),kind=int(aJ.z+.5);
    pos=vec3(0.); n=vec3(0.,0.,1.); vis=1.; tone=0.;
    if(kind==0 || kind==3) {
      vec3 A=uJ[a], D=uJ[b]-A; float len=max(length(D),.0001);
      vec3 d=safeUnit(D,vec3(0.,1.,0.)),u,v; basis(d,u,v);
      float t=aP.x,tc=clamp(t,0.,1.);
      float cap=t<0.?sqrt(max(0.,1.-pow(t/.065,2.))):t>1.?sqrt(max(0.,1.-pow((t-1.)/.065,2.))):1.;
      float muscle=1.+aP.w*sin(tc*3.14159);
      n=cos(aP.y)*u+sin(aP.y)*v;
      pos=A+d*len*t+n*mix(aR.x,aR.y,tc)*uScale*muscle*cap;
      n=safeUnit(n+d*(aR.x-aR.y)*uScale/len,n);
      vis=min(uV[a],uV[b]); if(kind==3) tone=4.;
    } else if(kind==1) {
      vec3 top=(uJ[11]+uJ[12])*.5,bot=(uJ[23]+uJ[24])*.5;
      float t=aP.y,tc=clamp(t,0.,1.);
      vec3 right=safeUnit(mix(uJ[11]-uJ[12],uJ[23]-uJ[24],tc),vec3(1.,0.,0.));
      vec3 up=safeUnit(top-bot,vec3(0.,1.,0.));
      vec3 fwd=safeUnit(cross(right,up),vec3(0.,0.,1.));
      float shoulder=clamp(length(uJ[11]-uJ[12])*.5,.15*uScale,.26*uScale);
      pos=mix(top,bot,t)+right*aP.x*shoulder/.192+fwd*aP.z*uScale;
      n=safeUnit(right*aN.x+up*aN.y+fwd*aN.z,fwd);
      vis=min(min(uV[11],uV[12]),min(uV[23],uV[24]));
    } else if(kind==2 || kind==7) {
      vec3 up=safeUnit(uJ[${HEAD}]-uJ[${NECK}],vec3(0.,1.,0.));
      vec3 right=uJ[7]-uJ[8]; right=safeUnit(right-up*dot(right,up),vec3(1.,0.,0.));
      vec3 fwd=safeUnit(cross(right,up),vec3(0.,0.,1.));
      vec3 local=aP.xyz;
      if(kind==7 && aP.w>0.5) local.y=.19+(local.y-.19)*uEyeOpen;
      pos=uJ[${HEAD}]+(right*local.x+up*local.y+fwd*local.z)*uHeadR;
      n=safeUnit(right*aN.x+up*aN.y+fwd*aN.z,fwd);
      vis=min(uV[0],max(uV[7],uV[8]));
      if(kind==7) tone=aP.w;
    } else if(kind==8) {
      pos=uJ[a]+aP.xyz*uScale;n=aN;vis=uV[a];
    } else if(kind==6) {
      vec3 W=uJ[a], I=uJ[a+5], P=uJ[a+17], end=(I+P)*.5;
      vec3 along=safeUnit(end-W,vec3(0.,-1.,0.));
      vec3 across=safeUnit(P-I,vec3(1.,0.,0.));
      vec3 normal=safeUnit(cross(along,across),vec3(0.,0.,1.));
      float t=aP.x,w=mix(.019*uScale,length(I-P)*.57,smoothstep(0.,.7,t));
      float th=aP.y,thickness=.012*uScale*(.8+.2*sin(t*3.14159));
      pos=mix(W,end,t)+across*cos(th)*w+normal*sin(th)*thickness;
      n=safeUnit(across*cos(th)*.4+normal*sin(th),normal); vis=uV[a];
    } else if(kind==4) {
      vec3 A=uJ[13],d=safeUnit(uJ[15]-A,vec3(0.,1.,0.)),u,v; basis(d,u,v);
      vec3 o=safeUnit(vec3(0.,0.,1.)-d*d.z,u),e2=cross(o,d);
      pos=mix(A,uJ[15],.88)+o*.033*uScale+(d*cos(aP.y)+e2*sin(aP.y))*aP.x*.025*uScale;
      n=o;vis=min(uV[13],uV[15]);tone=4.;
    }
  }
`;
