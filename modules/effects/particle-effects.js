// Efectos de partículas configurables (forma, disposición, colores, tamaño, clics):
// shaders compartidos (PARTICLE_*_GLSL) y createParticleEffects() con sus uniforms.
import * as THREE from 'three';

export const PARTICLE_VERTEX_GLSL = `
uniform float uParticleTime,uParticleSize,uParticleShape,uParticleLayout,uParticleTarget,uParticleColorMode,uParticleColorBy,uParticleColorSpeed,uParticlePaletteCount,uParticleClickIntensity,uParticleClickRadius,uParticleClickDuration,uParticleMotion;
uniform vec3 uParticlePalette[8];
uniform vec4 uParticleClicks[4];
vec3 particleColor(vec3 base,float seed,vec3 position){
  if(uParticleColorMode<.5)return base;
  float phase=fract((uParticleColorBy>.5?position.y*.15+.5:seed)+uParticleTime*uParticleColorSpeed*.10*uParticleMotion);
  float intensity=max(base.r,max(base.g,base.b));
  if(uParticleColorMode<1.5){vec3 p=abs(fract(vec3(phase)+vec3(0.,.666667,.333333))*6.-3.);return mix(vec3(.25),clamp(p-1.,0.,1.),.85)*intensity;}
  float at=phase*uParticlePaletteCount;int a=int(floor(at));int b=int(mod(float(a+1),uParticlePaletteCount));
  return mix(uParticlePalette[a],uParticlePalette[b],fract(at))*intensity;
}
vec3 particlePosition(vec3 base,float seed,float target){
  if(uParticleLayout<.5||abs(target-uParticleTarget)>.1&&uParticleTarget<1.5)return base;
  float a=seed*6.2831853,b=fract(seed*97.31)*6.2831853,t=uParticleTime*uParticleMotion;
  if(uParticleLayout<1.5)return vec3(cos(a),sin(a),sin(b))*(.7+fract(seed*31.71)*1.3);
  if(uParticleLayout<2.5){float y=fract(seed*97.31)*2.-1.,r=sqrt(max(0.,1.-y*y));return vec3(cos(a)*r,y,sin(a)*r)*1.8;}
  return vec3((seed-.5)*4.,sin(seed*18.+t*.7)*.4+(fract(seed*53.71)-.5)*1.5,(fract(seed*97.31)-.5)*1.2);
}
float particleMask(vec2 coord){
  vec2 p=coord*2.-1.;float edge;
  if(uParticleShape<.5)return pow(1.-smoothstep(0.,1.,length(p)),1.7);
  else if(uParticleShape<1.5)edge=max(abs(p.x),abs(p.y));
  else if(uParticleShape<2.5)edge=abs(p.x)+abs(p.y);
  else {float angle=atan(p.y,p.x);edge=length(p)/(.65+.30*cos(angle*5.));}
  return 1.-smoothstep(.8,1.,edge);
}
vec3 particleDisplace(vec3 position){
  if(uParticleMotion<.5)return position;
  vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.);vec2 ndc=clip.xy/max(.001,clip.w),offset=vec2(0.);
  for(int i=0;i<4;i++){
    float age=uParticleTime-uParticleClicks[i].z,type=uParticleClicks[i].w;
    if(type<.5||age<0.||age>uParticleClickDuration)continue;
    float progress=age/uParticleClickDuration;vec2 delta=ndc-uParticleClicks[i].xy;float distance=length(delta);
    vec2 direction=delta/max(.001,distance);float influence=1.-smoothstep(0.,uParticleClickRadius,distance),force=0.;
    if(type<1.5)force=exp(-pow((distance/uParticleClickRadius-progress)*9.,2.))*(1.-progress)*.12;
    else if(type<2.5)force=influence*sin(progress*3.14159265)*.25;
    else force=influence*sin(progress*3.14159265)*(type<3.5?-.15:.20);
    offset+=direction*force*uParticleClickIntensity;
  }
  position.xy+=clamp(offset,vec2(-.4),vec2(.4))*max(.001,clip.w)/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);return position;
}`;
export const PARTICLE_GLSL = PARTICLE_VERTEX_GLSL;
export const PARTICLE_FRAGMENT_GLSL =
  'uniform float uParticleShape;\n' +
  PARTICLE_VERTEX_GLSL.slice(
    PARTICLE_VERTEX_GLSL.indexOf('float particleMask'),
    PARTICLE_VERTEX_GLSL.indexOf('vec3 particleDisplace'),
  );

export function createParticleEffects() {
  const uniforms = {};
  for (const [key, value] of Object.entries({
    Time: 0,
    Size: 1,
    Shape: 0,
    Layout: 0,
    Target: 2,
    ColorMode: 0,
    ColorBy: 0,
    ColorSpeed: 0,
    PaletteCount: 2,
    ClickIntensity: 1,
    ClickRadius: 0.5,
    ClickDuration: 1,
    Motion: 1,
  }))
    uniforms[`uParticle${key}`] = { value };
  uniforms.uParticlePalette = { value: Array.from({ length: 8 }, () => new THREE.Color('#66efbc')) };
  uniforms.uParticleClicks = { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, -10, 0)) };
  let cursor = 0,
    clickType = 0,
    enabled = true;
  return {
    uniforms,
    configure(options = {}) {
      const choices = {
        Shape: ['circle', 'square', 'diamond', 'star'],
        Layout: ['auto', 'cloud', 'sphere', 'waves'],
        Target: ['ambient', 'central', 'both'],
        ColorMode: ['single', 'rainbow', 'palette'],
        ColorBy: ['particle', 'height'],
      };
      for (const [key, list] of Object.entries(choices)) {
        const value = list.indexOf(options[`particle${key}`]);
        if (value >= 0) uniforms[`uParticle${key}`].value = value;
      }
      for (const [key, min, max] of [
        ['Size', 0.5, 4],
        ['ColorSpeed', 0, 2],
        ['ClickIntensity', 0, 2],
        ['ClickRadius', 0.1, 2],
        ['ClickDuration', 0.2, 3],
      ]) {
        const value = options[key.startsWith('Click') ? key[0].toLowerCase() + key.slice(1) : `particle${key}`];
        if (Number.isFinite(value)) uniforms[`uParticle${key}`].value = THREE.MathUtils.clamp(value, min, max);
      }
      if (
        Array.isArray(options.particlePalette) &&
        options.particlePalette.length >= 2 &&
        options.particlePalette.length <= 8 &&
        options.particlePalette.every(c => /^#[0-9a-f]{6}$/i.test(c))
      ) {
        uniforms.uParticlePaletteCount.value = options.particlePalette.length;
        options.particlePalette.forEach((c, i) => uniforms.uParticlePalette.value[i].set(c));
      }
      if (options.reducedMotion !== undefined) uniforms.uParticleMotion.value = options.reducedMotion ? 0 : 1;
      clickType = ['none', 'wave', 'burst', 'attract', 'repel'].indexOf(options.clickEffect);
      if (clickType < 0) clickType = 0;
      enabled = options.particles !== false && options.particleDensity !== 0;
      if (!enabled || uniforms.uParticleMotion.value === 0) uniforms.uParticleClicks.value.forEach(c => (c.w = 0));
    },
    update(timeSeconds) {
      if (Number.isFinite(timeSeconds)) uniforms.uParticleTime.value = timeSeconds;
    },
    click(x, y, timeSeconds = uniforms.uParticleTime.value) {
      if (!enabled || !clickType || uniforms.uParticleMotion.value === 0 || !Number.isFinite(x + y + timeSeconds))
        return;
      uniforms.uParticleClicks.value[cursor++ % 4].set(
        THREE.MathUtils.clamp(x, -1, 1),
        THREE.MathUtils.clamp(y, -1, 1),
        timeSeconds,
        clickType,
      );
    },
    state() {
      return {
        shape: uniforms.uParticleShape.value,
        layout: uniforms.uParticleLayout.value,
        target: uniforms.uParticleTarget.value,
        colors: uniforms.uParticleColorMode.value,
        size: uniforms.uParticleSize.value,
        clicks: uniforms.uParticleClicks.value.filter(
          c =>
            c.w > 0 &&
            uniforms.uParticleTime.value - c.z >= 0 &&
            uniforms.uParticleTime.value - c.z < uniforms.uParticleClickDuration.value,
        ).length,
      };
    },
  };
}
