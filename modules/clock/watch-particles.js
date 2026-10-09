// Reloj de partículas: nebulosa → logo HT → reloj con agujas reales, y sus grupos de rotación.
// createWatchParticles({...}) carga el logo, crea los puntos y devuelve uniforms (U) y grupos.
import * as THREE from 'three';
import { buildShapes, clockHandAttr } from '../shared/index.js';

// ---------- Ruido simplex 3D (Ashima Arts, MIT) ----------
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const POINT_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = pow(smoothstep(0.5, 0.0, d), 1.7) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

export const CLOCK_ADDITIVE = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fragmentShader: POINT_FRAG,
};

// Inclinación de presentación del reloj (el logo, en cambio, mira de frente).
export const WATCH_TILT = 0.28;

const rand = () => Math.random();

export async function createWatchParticles({ scene, renderer, magic, count: N }) {
  const logoImg = await new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = './ht_logo.png';
  });
  const { watch, coin } = buildShapes(N, logoImg);
  const geo = new THREE.BufferGeometry();
  // al arrancar, el reloj se arma desde una nube de partículas
  const aFrom = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // nube detrás del reloj (nunca pegada a la cámara), para que el armado no sature la pantalla
    const r = 3.5 + rand() * 3,
      th = rand() * Math.PI * 2,
      ph = Math.acos(rand() * 2 - 1);
    aFrom.set(
      [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.7, -Math.abs(r * Math.sin(ph) * Math.sin(th)) - 1.5],
      i * 3,
    );
  }
  const aRand = new Float32Array(N).map(rand);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // no se usa, pero three la pide
  geo.setAttribute('aFrom', new THREE.BufferAttribute(aFrom, 3));
  geo.setAttribute('aLogo', new THREE.BufferAttribute(coin.pos, 3));
  geo.setAttribute('aTo', new THREE.BufferAttribute(watch.pos, 3));
  geo.setAttribute('aTintL', new THREE.BufferAttribute(coin.tint, 1));
  geo.setAttribute('aTintW', new THREE.BufferAttribute(watch.tint, 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));
  geo.setAttribute('aHand', new THREE.BufferAttribute(clockHandAttr(N), 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

  const U = {
    uTime: { value: 0 },
    uStage: { value: 0 }, // 0 nebulosa → 1 logo HT → 2 reloj
    uSpeed: { value: 0 },
    uScan: { value: -9 },
    uSize: { value: 3.2 },
    uIntensity: { value: 0.5 },
    uBrand: { value: new THREE.Color('#64a451') },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uHand: { value: [new THREE.Vector3(99, 99, 0), new THREE.Vector3(99, 99, 0)] },
    uHandOn: { value: [0, 0] },
    uHandGrab: { value: [0, 0] },
    uClockAng: { value: new THREE.Vector3() },
    uMagic: { value: magic },
  };

  const particles = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      ...CLOCK_ADDITIVE,
      uniforms: U,
      vertexShader: /* glsl */ `
      uniform float uTime, uStage, uSpeed, uScan, uSize, uIntensity, uPixelRatio;
      uniform vec3 uHand[2]; uniform float uHandOn[2]; uniform float uHandGrab[2];
      uniform vec3 uClockAng, uMagic, uBrand;
      attribute vec3 aFrom, aLogo, aTo, aHand; attribute float aRand, aTintL, aTintW;
      varying vec3 vColor; varying float vAlpha;
      ${NOISE}
      // agujas del reloj: misma geometría que clockHandPos() en shapes.js
      vec3 clockPos(vec3 h){
        float id = floor(h.x + 0.5);
        float L = id < 1.5 ? 0.7 : id < 2.5 ? 1.05 : 1.18;
        float W = id < 1.5 ? 0.07 : id < 2.5 ? 0.05 : 0.013;
        float Z = id < 1.5 ? 0.07 : id < 2.5 ? 0.1 : 0.13;
        float T = id < 1.5 ? -0.1 : id < 2.5 ? -0.12 : -0.28;
        float a = id < 1.5 ? uClockAng.x : id < 2.5 ? uClockAng.y : uClockAng.z;
        float along = T + (L - T) * h.y;
        float lat = h.z * W * (id < 2.5 ? 1.0 - 0.6 * h.y : 1.0);
        return vec3(lat * cos(a) + along * sin(a), -lat * sin(a) + along * cos(a), Z + h.z * 0.015);
      }
      void main(){
        // etapas: nebulosa → logo (m1) y logo ↔ reloj (m2), con retardo distinto por partícula
        float m1 = smoothstep(0.0, 1.0, clamp(clamp(uStage, 0.0, 1.0) * 1.6 - aRand * 0.6, 0.0, 1.0));
        float m2 = smoothstep(0.0, 1.0, clamp(clamp(uStage - 1.0, 0.0, 1.0) * 1.6 - aRand * 0.6, 0.0, 1.0));
        float isHand = step(0.5, aHand.x) * m2;   // agujas: solo cuando es reloj
        vec3 wpos = aHand.x > 0.5 ? clockPos(aHand) : aTo;
        vec3 to = mix(aLogo, wpos, m2);
        vec3 p = uStage < 1.0 ? mix(aFrom, aLogo, m1) : to;

        // transiciones en remolino, de frente a la cámara (nunca se acercan a ella)
        float swirl = uStage < 1.0 ? (1.0 - m1) * (1.0 - m1) * (4.0 + 6.0 * aRand) : sin(m2 * 3.14159) * (1.5 + 2.5 * aRand);
        p.xy = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * p.xy;
        vec3 q = p * 0.6 + aRand;
        float turb = uStage < 1.0 ? sin(m1 * 3.14159) : sin(m2 * 3.14159);
        p += turb * vec3(snoise(q + uTime * 0.4), snoise(q + 17.1), snoise(q + 33.3)) * 0.6;

        // respiración orgánica (casi nula en las agujas, para que se lean nítidas)
        vec3 q2 = p * 1.3 + uTime * 0.35;
        p += 0.03 * (1.0 - 0.85 * isHand) * vec3(snoise(q2), snoise(q2 + 5.2), snoise(q2 + 9.7));

        // al girarlo rápido las partículas se sueltan y se rearman al frenar
        vec3 q3 = p * 0.9 + uTime * 0.8 + aRand * 3.0;
        p += uSpeed * (0.2 + 0.8 * pow(fract(aRand * 11.3), 3.0)) * vec3(snoise(q3), snoise(q3 + 4.1), snoise(q3 + 8.3));

        vec4 world = modelMatrix * vec4(p, 1.0);

        // mano abierta: ondula y brilla donde apunta, sin deformar el reloj
        float glow = 0.0;
        for (int i = 0; i < 2; i++) {
          vec3 d = world.xyz - uHand[i];
          float dist = length(d.xy) + abs(d.z) * 0.2;
          vec3 dir = vec3(d.xy / max(length(d.xy), 1e-3), 0.0);
          float f = uHandOn[i] * exp(-dist * dist * 2.2);
          float ripple = sin(dist * 14.0 - uTime * 6.0) * 0.5 + 0.5;
          world.xyz += (dir * 0.1 + vec3(0.0, 0.0, 0.08 * ripple)) * f * (1.0 - uHandGrab[i]);
          glow += f * (0.45 + 0.35 * ripple) * (1.0 - 0.6 * uHandGrab[i]);
        }

        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;
        float sz = uSize * (0.55 + 0.9 * fract(aRand * 3.7)) * (1.0 + glow * 0.5);
        gl_PointSize = sz * uPixelRatio * (6.5 / -mv.z);

        // plata, con destellos mágicos y un barrido de energía que recorre el reloj
        float grad = smoothstep(-2.0, 2.0, p.y + 0.5 * p.z);
        vec3 c = mix(vec3(0.62, 0.68, 0.76), vec3(0.95, 0.97, 1.0), grad);
        c = mix(c, uMagic * 1.5, pow(fract(aRand * 5.1), 10.0));
        c = mix(c, uBrand * 1.35, mix(aTintL, aTintW, m2));              // verde de la marca en el logo
        float scan = exp(-pow((to.y - uScan) * 2.6, 2.0));
        c += uMagic * scan * 0.8;
        c = mix(c, vec3(1.1), isHand * step(aHand.x, 2.5));               // horario y minutero
        c = mix(c, uMagic * 1.9, step(2.5, aHand.x) * m2);                // segundero mágico
        c += glow * uMagic * 1.1;
        c = mix(uMagic * 0.35, c, uStage < 1.0 ? m1 : 1.0);               // llegan verdes y toman su color
        vColor = c * uIntensity;
        float front = smoothstep(-2.8, 1.6, world.z);                      // lo de atrás más tenue
        vColor *= mix(0.25, 1.15, front);
        vAlpha = 0.7 + 0.3 * sin(uTime * 2.3 + aRand * 60.0);
      }`,
    }),
  );

  // hero: rotación del usuario > tiltG: inclinación de presentación > spinG: vaivén
  const hero = new THREE.Group(),
    tiltG = new THREE.Group(),
    spinG = new THREE.Group();
  hero.add(tiltG);
  tiltG.add(spinG);
  spinG.add(particles);
  scene.add(hero);
  return { U, hero, tiltG, spinG };
}
