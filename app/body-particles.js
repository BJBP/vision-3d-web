// Partículas del cuerpo: nebulosa → logo HT → avatar, con sus uniforms (U) y articulaciones (J, V).
// createBodyParticles({...}) carga el logo, crea la geometría y añade los puntos a la escena.
import * as THREE from 'three';
import { logoPixels, logoCoin } from '../modules/shared/index.js';
import { buildBody, DEFORM_GLSL, JOINTS, FINISHES } from '../modules/avatar/index.js';
import { PARTICLE_VERTEX_GLSL, PARTICLE_FRAGMENT_GLSL } from '../modules/effects/index.js';

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
${PARTICLE_FRAGMENT_GLSL}
void main(){
  float mask = particleMask(gl_PointCoord);
  if (mask <= 0.) discard;
  float a = mask * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;
export const ADDITIVE_POINTS = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fragmentShader: POINT_FRAG,
};

const rand = () => Math.random();

export async function createBodyParticles({
  scene,
  renderer,
  effects,
  magic,
  finish,
  surfaceOn,
  reducedMotion,
  scale: S,
}) {
  // ---------- Partículas: nebulosa → logo HT → avatar ----------
  const logoImg = await new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = './ht_logo.png';
  });
  const body = buildBody();
  const N = body.n;
  const coin = logoCoin(N, logoPixels(logoImg));
  const aFrom = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // nube detrás de la escena, nunca pegada a la cámara
    const r = 3.5 + rand() * 3,
      th = rand() * Math.PI * 2,
      ph = Math.acos(rand() * 2 - 1);
    aFrom.set(
      [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.7, -Math.abs(r * Math.sin(ph) * Math.sin(th)) - 1.5],
      i * 3,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // no se usa, pero three la pide
  geo.setAttribute('aN', new THREE.BufferAttribute(body.aN, 3));
  geo.setAttribute('aJ', new THREE.BufferAttribute(body.aJ, 3));
  geo.setAttribute('aP', new THREE.BufferAttribute(body.aP, 4));
  geo.setAttribute('aR', new THREE.BufferAttribute(body.aR, 2));
  geo.setAttribute('aRand', new THREE.BufferAttribute(body.aRand, 1));
  geo.setAttribute('aFrom', new THREE.BufferAttribute(aFrom, 3));
  geo.setAttribute('aLogo', new THREE.BufferAttribute(coin.pos, 3));
  geo.setAttribute('aTintL', new THREE.BufferAttribute(coin.tint, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
  const particleIndices = new Uint32Array(N);
  geo.setIndex(new THREE.BufferAttribute(particleIndices, 1));

  const J = Array.from({ length: JOINTS }, () => new THREE.Vector3(0, -20, 0)); // articulaciones en escena
  const V = new Array(JOINTS).fill(0); // visibilidad
  const U = {
    ...effects.uniforms,
    uJ: { value: J },
    uV: { value: V },
    uTime: { value: 0 },
    uStage: { value: 0 }, // 0 nebulosa → 1 logo HT → 2 avatar
    uScale: { value: S },
    uHeadR: { value: 0.1 * S },
    uGlitch: { value: 0 },
    uEyeOpen: { value: 1 },
    uFinish: { value: FINISHES.indexOf(finish) },
    uSkin: { value: new THREE.Color('#c98e6b') },
    uSurface: { value: surfaceOn ? 1 : 0 },
    uMotion: { value: reducedMotion ? 0 : 1 },
    uSize: { value: surfaceOn ? 1.65 : 2.65 },
    uIntensity: { value: 0.65 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uMagic: { value: magic },
    uBrand: { value: new THREE.Color('#64a451') },
  };

  const particles = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      ...ADDITIVE_POINTS,
      uniforms: U,
      vertexShader: /* glsl */ `
      uniform vec3 uJ[${JOINTS}]; uniform float uV[${JOINTS}];
      uniform float uTime, uStage, uScale, uHeadR, uGlitch, uSize, uIntensity, uPixelRatio, uEyeOpen, uSurface, uMotion;
      uniform vec3 uMagic, uBrand;
      attribute vec3 aJ, aN, aFrom, aLogo; attribute vec4 aP; attribute vec2 aR; attribute float aRand, aTintL;
      varying vec3 vColor; varying float vAlpha;
      ${PARTICLE_VERTEX_GLSL}
      ${NOISE}
      float hash(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      ${DEFORM_GLSL}
      void main(){
        vec3 pos,n;float vis,tone;
        anatomy(pos,n,vis,tone);
        // energía que se evapora del cuerpo
        float rise = step(0.97, aRand) * fract(uTime * 0.22 + aRand * 13.0) * uMotion * (1.-uSurface);
        pos.y += rise * 0.9;
        pos += mix(.003,.0005,uSurface) * uMotion * uScale * vec3(snoise(pos * 2.0 + uTime * 0.6), snoise(pos * 2.0 + 7.0 + uTime * 0.6), 0.0);
        // glitch holográfico: franjas horizontales que se desplazan un instante
        float slice = floor(pos.y * 7.0);
        pos.x += uGlitch * (hash(slice + floor(uTime * 24.0)) - 0.5) * 0.35;

        // transición entre etapas, con retardo distinto por partícula y en remolino
        float m1 = smoothstep(0.0, 1.0, clamp(clamp(uStage, 0.0, 1.0) * 1.6 - aRand * 0.6, 0.0, 1.0));
        float m2 = smoothstep(0.0, 1.0, clamp(clamp(uStage - 1.0, 0.0, 1.0) * 1.6 - aRand * 0.6, 0.0, 1.0));
        vec3 p = uStage < 1.0 ? mix(aFrom, aLogo, m1) : mix(aLogo, pos, m2);
        float swirl = uStage < 1.0 ? (1.0 - m1) * (1.0 - m1) * (4.0 + 6.0 * aRand) : sin(m2 * 3.14159) * (1.5 + 2.5 * aRand);
        swirl *= uMotion;
        p.xy = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * p.xy;
        vec3 q = p * 0.6 + aRand;
        float turb = uStage < 1.0 ? sin(m1 * 3.14159) : sin(m2 * 3.14159);
        p += uMotion * turb * vec3(snoise(q + uTime * 0.4), snoise(q + 17.1), snoise(q + 33.3)) * 0.6;
        if (uStage < 1.0) p += 0.03 * vec3(snoise(p * 1.3 + uTime * 0.35), snoise(p * 1.3 + 5.2 + uTime * 0.35), 0.0);

        p = particleDisplace(particlePosition(p, aRand, 1.));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = mix(2.1, uSize, m2) * (0.65 + 0.55 * fract(aRand * 3.7));
        gl_PointSize = sz * uParticleSize * uPixelRatio * (7.5 / -mv.z);

        // color del avatar: holograma con borde brillante (fresnel) y líneas de escaneo
        vec3 viewDir = normalize(cameraPosition - p);
        float fres = pow(1.0 - abs(dot(n, viewDir)), 2.0);
        vec3 holo = particleColor(uMagic, aRand, p) * (0.28 + 1.25 * fres) + vec3(0.8, 1.0, 0.9) * pow(fres, 4.0) * 0.7;
        holo *= mix(1.0, 0.06 + 0.12 * fres, uSurface);
        if(uParticleLayout>.5 && uParticleTarget>.5)holo=particleColor(uMagic,aRand,p)*.65;
        if (tone == 1.0) holo *= 0.12;
        if (tone == 2.0) holo *= 0.15;
        if (tone == 4.0) holo = vec3(.6,.8,.7);
        if (tone == 3.0) holo = vec3(0.65, 0.9, 0.8) * 0.5;
        vec3 logoCol = mix(vec3(0.85, 0.9, 0.95), uBrand * 1.35, aTintL);
        vec3 c = mix(logoCol, holo, m2);
        c = mix(uMagic * 0.35, c, uStage < 1.0 ? m1 : 1.0);   // llegan verdes y toman su color
        vColor = c * uIntensity;
        if(uParticleLayout>.5 && uParticleTarget>.5)vis=1.;
        vAlpha = (0.7 + 0.3 * sin(uTime * 2.3 + aRand * 60.0)) * mix(1.0, smoothstep(0.3, 0.7, vis) * (1.0 - rise), m2);
        vAlpha *= 1.0 - smoothstep(1.62,1.99,uStage)*uSurface;
      }`,
    }),
  );
  particles.frustumCulled = false;
  scene.add(particles);
  return { N, geo, particleIndices, J, V, U, particles };
}
