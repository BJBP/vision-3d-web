// Efectos de ambiente alrededor del avatar: ondas del logo, plataforma bajo los pies, polvo y
// lluvia digital con la silueta real (OAK-D). createAmbientEffects({...}) los añade a la escena.
import * as THREE from 'three';
import { PARTICLE_VERTEX_GLSL } from '../modules/effects/index.js';
import { ADDITIVE_POINTS } from './body-particles.js';

const rand = () => Math.random();

export function createAmbientEffects({ scene, camera, effects, U }) {
  // ---------- Ondas de pulsar alrededor del logo ----------
  const RINGS = 3,
    PER_RING = 1800;
  const ringGeo = new THREE.BufferGeometry();
  const rAng = new Float32Array(RINGS * PER_RING),
    rIdx = new Float32Array(RINGS * PER_RING),
    rRnd = new Float32Array(RINGS * PER_RING);
  for (let i = 0; i < rAng.length; i++) {
    rAng[i] = rand() * Math.PI * 2;
    rIdx[i] = Math.floor(i / PER_RING);
    rRnd[i] = rand();
  }
  ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rAng.length * 3), 3));
  ringGeo.setAttribute('aAng', new THREE.BufferAttribute(rAng, 1));
  ringGeo.setAttribute('aIdx', new THREE.BufferAttribute(rIdx, 1));
  ringGeo.setAttribute('aRand', new THREE.BufferAttribute(rRnd, 1));
  ringGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  const rings = new THREE.Points(
    ringGeo,
    new THREE.ShaderMaterial({
      ...ADDITIVE_POINTS,
      uniforms: {
        ...effects.uniforms,
        uTime: U.uTime,
        uMagic: U.uMagic,
        uPixelRatio: U.uPixelRatio,
        uOn: { value: 0 },
      },
      vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio, uOn; uniform vec3 uMagic;
      attribute float aAng, aIdx, aRand;
      varying vec3 vColor; varying float vAlpha;
      ${PARTICLE_VERTEX_GLSL}
      void main(){
        float ph = fract(uTime / 4.2 + aIdx / 3.0);
        float r = 2.1 + ph * 4.5 + (aRand - 0.5) * 0.06 * (1.0 + ph * 4.0);
        vec3 p = vec3(cos(aAng) * r, sin(aAng) * r, -0.1 + (aRand - 0.5) * 0.1 * ph);
        p = particleDisplace(particlePosition(p, aRand, 0.));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uParticleSize * (2.0 + 2.5 * fract(aRand * 7.0)) * uPixelRatio * (7.5 / -mv.z);
        vColor = particleColor(uMagic, aRand, p) * pow(1.0 - ph, 2.2) * smoothstep(0.0, 0.06, ph) * 0.55 * uOn;
        vAlpha = 1.0;
      }`,
    }),
  );
  scene.add(rings);

  // ---------- Plataforma holográfica bajo los pies ----------
  const FLOOR = 5200;
  const floorGeo = new THREE.BufferGeometry();
  const fP = new Float32Array(FLOOR * 3);
  for (let i = 0; i < FLOOR; i++) {
    const k = i % 4;
    // anillos concéntricos + radios + disco tenue (y = brillo relativo)
    const r =
      k < 2 ? [0.45, 0.8, 1.15][i % 3] + (rand() - 0.5) * 0.02 : k === 2 ? rand() * 1.15 : Math.sqrt(rand()) * 1.15;
    const a = k === 2 ? (Math.floor(rand() * 24) / 24) * Math.PI * 2 : rand() * Math.PI * 2;
    fP.set([Math.cos(a) * r, k === 3 ? 0.4 : 1, Math.sin(a) * r], i * 3);
  }
  floorGeo.setAttribute('position', new THREE.BufferAttribute(fP, 3));
  const floor = new THREE.Points(
    floorGeo,
    new THREE.ShaderMaterial({
      ...ADDITIVE_POINTS,
      uniforms: {
        ...effects.uniforms,
        uTime: U.uTime,
        uMagic: U.uMagic,
        uPixelRatio: U.uPixelRatio,
        uOn: { value: 0 },
      },
      vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio, uOn; uniform vec3 uMagic;
      varying vec3 vColor; varying float vAlpha;
      ${PARTICLE_VERTEX_GLSL}
      void main(){
        float r = length(position.xz);
        vec4 mv = modelViewMatrix * vec4(position.x, 0.0, position.z, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uParticleSize * 2.2 * uPixelRatio * (7.5 / -mv.z);
        float wave = 0.5 + 0.5 * sin(r * 9.0 - uTime * 3.0);      // pulso que sale desde el centro
        vColor = particleColor(uMagic, fract(r*13.71), position) * position.y * (0.25 + 0.6 * wave) * (1.0 - smoothstep(0.3, 1.2, r)) * uOn;
        vAlpha = 1.0;
      }`,
    }),
  );
  floor.scale.setScalar(1.3);
  floor.frustumCulled = false;
  scene.add(floor);

  // ---------- Polvo mágico ----------
  const DUST = 2200;
  const dustGeo = new THREE.BufferGeometry();
  const dOrb = new Float32Array(DUST * 4);
  for (let i = 0; i < DUST; i++)
    dOrb.set([2.6 + rand() * 2.6, rand() * Math.PI * 2, (rand() - 0.5) * 5, rand()], i * 4);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
  dustGeo.setAttribute('aOrb', new THREE.BufferAttribute(dOrb, 4));
  dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      ...ADDITIVE_POINTS,
      uniforms: {
        ...effects.uniforms,
        uTime: U.uTime,
        uMagic: U.uMagic,
        uPixelRatio: U.uPixelRatio,
        uOn: { value: 0 },
      },
      vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio, uOn; uniform vec3 uMagic;
      attribute vec4 aOrb;
      varying vec3 vColor; varying float vAlpha;
      ${PARTICLE_VERTEX_GLSL}
      void main(){
        float sp = (0.1 + 0.2 * aOrb.w) * (aOrb.w > 0.5 ? 1.0 : -1.0);
        float a = aOrb.y + uTime * sp;
        vec3 p = vec3(cos(a) * aOrb.x, aOrb.z + sin(uTime * 0.6 + aOrb.w * 30.0) * 0.25, sin(a) * aOrb.x * 0.55 - 0.8);
        p = particleDisplace(particlePosition(p, aOrb.w, 0.));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = pow(0.5 + 0.5 * sin(uTime * (1.5 + aOrb.w * 3.0) + aOrb.w * 90.0), 3.0);
        gl_PointSize = uParticleSize * (1.5 + 3.0 * tw) * uPixelRatio * (7.5 / -mv.z);
        vColor = mix(particleColor(uMagic, aOrb.w, p), vec3(0.8, 1.0, 0.95), tw * 0.4) * (0.12 + 0.6 * tw) * uOn;
        vAlpha = 1.0;
      }`,
    }),
  );
  scene.add(dust);

  // ---------- Lluvia digital de fondo; la silueta real brilla dentro ----------
  const SW = 96,
    SH = 54;
  const silData = new Uint8Array(SW * SH);
  const silAcc = new Float32Array(SW * SH);
  const silTex = new THREE.DataTexture(silData, SW, SH, THREE.RedFormat, THREE.UnsignedByteType);
  silTex.magFilter = silTex.minFilter = THREE.LinearFilter;
  silTex.needsUpdate = true;
  const GX = 150,
    GY = 84;
  const rainGeo = new THREE.BufferGeometry();
  const cell = new Float32Array(GX * GY * 2),
    cRnd = new Float32Array(GX * GY);
  for (let j = 0, k = 0; j < GY; j++)
    for (let i = 0; i < GX; i++, k++) {
      cell[k * 2] = (i + 0.5) / GX;
      cell[k * 2 + 1] = (j + 0.5) / GY;
      cRnd[k] = rand();
    }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GX * GY * 3), 3));
  rainGeo.setAttribute('aCell', new THREE.BufferAttribute(cell, 2));
  rainGeo.setAttribute('aRand', new THREE.BufferAttribute(cRnd, 1));
  rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
  const RU = {
    ...effects.uniforms,
    uTime: U.uTime,
    uMagic: U.uMagic,
    uPixelRatio: U.uPixelRatio,
    uSil: { value: silTex },
    uPlane: { value: new THREE.Vector2(1, 1) },
  };
  const RAIN_Z = -4;
  const rain = new THREE.Points(
    rainGeo,
    new THREE.ShaderMaterial({
      ...ADDITIVE_POINTS,
      uniforms: RU,
      vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio; uniform vec3 uMagic; uniform sampler2D uSil; uniform vec2 uPlane;
      attribute vec2 aCell; attribute float aRand;
      varying vec3 vColor; varying float vAlpha;
      ${PARTICLE_VERTEX_GLSL}
      float hash(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      void main(){
        float col = aCell.x, y = aCell.y;
        float seed = hash(col * 917.3);
        float head = 1.0 - fract(uTime * (0.05 + seed * 0.13) + seed * 7.0);
        float d = fract(y - head);
        float L = 0.2 + 0.35 * hash(seed * 13.1);
        float trail = d < L ? pow(1.0 - d / L, 2.4) : 0.0;
        float headGlow = (1.0 - smoothstep(0.0, 0.018, d));
        float flick = step(0.3, hash(floor(uTime * 7.0 + aRand * 40.0) + aRand * 78.2));
        float s = texture2D(uSil, vec2(col, 1.0 - y)).r * 0.6;
        float b = (trail * (0.3 + 0.7 * flick) * 0.4 + headGlow) * (0.3 + 1.8 * s) + s * 0.08;
        vec4 mv = modelViewMatrix * vec4((col - 0.5) * uPlane.x, (y - 0.5) * uPlane.y, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uParticleSize * (1.8 + headGlow * 1.6 + s * 1.2) * uPixelRatio;
        vColor = mix(particleColor(uMagic, aRand, vec3(col,y,0.)), vec3(0.85, 1.0, 0.9), headGlow * 0.7) * b * 0.075;
        vAlpha = 1.0;
      }`,
    }),
  );
  rain.position.z = RAIN_Z;
  scene.add(rain);
  function fitRain() {
    const h = 2 * (camera.position.z - RAIN_Z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    RU.uPlane.value.set(h * camera.aspect * 1.06, h * 1.06);
  }

  function updateSilhouette(b64) {
    let bin;
    try {
      bin = atob(b64);
    } catch {
      return;
    }
    if (bin.length !== silAcc.length) return;
    for (let i = 0; i < silAcc.length; i++) {
      silAcc[i] = silAcc[i] * 0.55 + bin.charCodeAt(i) * 0.45;
      silData[i] = silAcc[i];
    }
    silTex.needsUpdate = true;
    return true;
  }

  function clearSilhouette() {
    silAcc.fill(0);
    silData.fill(0);
    silTex.needsUpdate = true;
  }

  fitRain();
  const silhouette = { width: SW, height: SH, texture: silTex, update: updateSilhouette, clear: clearSilhouette };
  return { rings, floor, dust, rain, fitRain, silhouette };
}
