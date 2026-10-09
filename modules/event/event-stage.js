// Modo evento: las manos cargan energía y la liberan en un destello en pantalla.
// createEventStage() recibe muñecas proyectadas o manos de la cámara; no usa imágenes ni red.
import * as THREE from 'three';
import { EnergyGesture } from '../tracking/index.js';
import { createParticleEffects, PARTICLE_VERTEX_GLSL, PARTICLE_FRAGMENT_GLSL } from '../effects/index.js';

// Screen-space light follows projected avatar wrists, or camera hands alone.
// No camera images, textures, network requests or extra renderers are needed.
export function createEventStage() {
  const effects = createParticleEffects();
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 3;
  const gesture = new EnergyGesture(),
    root = document.createElement('div');
  root.id = 'event-caption';
  root.innerHTML = '<span id="event-cue">Entra en escena.</span><span id="event-demo" hidden>DEMO</span>';
  document.body.append(root);
  const cue = root.firstElementChild,
    demoLabel = root.lastElementChild;
  const plane = new THREE.PlaneGeometry(2, 2),
    color = new THREE.Color('#9fffe0');
  function halo(tint) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(tint) }, uAlpha: { value: 0 }, uRing: { value: 0 } },
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha,uRing;
        void main(){float r=length(vUv-.5)*2.;float core=exp(-r*r*40.)*.85+exp(-r*r*5.)*.17;
          float ring=exp(-pow((r-.71)*75.,2.))*.7+exp(-pow((r-.71)*18.,2.))*.1;
          gl_FragColor=vec4(uColor,(mix(core,ring,uRing))*(1.-smoothstep(.86,1.,r))*uAlpha);}`,
    });
    const mesh = new THREE.Mesh(plane, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  const palms = [halo('#85ffd3'), halo('#8dbdff')],
    orbGlow = halo('#b2ffe0'),
    shock = halo('#96e7ff'),
    clickGlow = halo('#96e7ff');
  shock.material.uniforms.uRing.value = 1;
  const orb = new THREE.Group();
  scene.add(orb);
  const shell = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1)),
    new THREE.LineBasicMaterial({
      color: '#a1ffe5',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );
  orb.add(shell);
  const orbits = [];
  for (let i = 0; i < 3; i++) {
    const points = Array.from(
      { length: 129 },
      (_, j) => new THREE.Vector3(Math.cos((j / 128) * Math.PI * 2), Math.sin((j / 128) * Math.PI * 2), 0),
    );
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: i === 1 ? '#c9bc83' : '#7de2ee',
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    line.rotation.set(i * 0.9, 0.5 + i * 0.7, i * 0.6);
    line.scale.setScalar(1.2 + i * 0.16);
    orb.add(line);
    orbits.push(line);
  }
  const max = 1400,
    pos = new Float32Array(max * 3),
    life = new Float32Array(max),
    sizes = new Float32Array(max),
    tints = new Float32Array(max * 3),
    velocity = new Float32Array(max * 2),
    ttl = new Float32Array(max),
    clicked = new Uint8Array(max);
  const geometry = new THREE.BufferGeometry();
  for (const [name, array, size] of [
    ['position', pos, 3],
    ['aLife', life, 1],
    ['aSize', sizes, 1],
    ['aTint', tints, 3],
  ])
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...effects.uniforms, uPixel: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `${PARTICLE_VERTEX_GLSL} attribute float aLife,aSize; attribute vec3 aTint; uniform float uPixel; uniform vec3 uTint; varying float vLife; varying vec3 vTint; void main(){vLife=aLife;vTint=particleColor(aTint*uTint,fract(abs(position.x*7.+position.y*13.)),position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uPixel*uParticleSize*sqrt(max(aLife,0.));}`,
      fragmentShader: `${PARTICLE_FRAGMENT_GLSL} varying float vLife; varying vec3 vTint; void main(){gl_FragColor=vec4(vTint,particleMask(gl_PointCoord)*vLife);}`,
    }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);
  let cursor = 0,
    clickCursor = 0,
    clickGlowAge = 10,
    clickGlowDuration = 0.5,
    clickGlowIntensity = 1,
    lastPoints = new Map(),
    latest = { phase: 'idle', charge: 0, bursts: 0 },
    enabled = true,
    aspect = 1,
    burstAge = 10,
    lastNow = 0,
    orbAmount = 0,
    lastDemo = null,
    particleEnabled = true,
    bloomEnabled = true,
    clickOptions = {};
  const point = p => new THREE.Vector2((p.sx * 2 - 1) * aspect, 1 - p.sy * 2);
  function emit(x, y, vx, vy, size, tint, seconds, isClick = false) {
    if (!particleEnabled) return;
    const i = cursor++ % max;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = 0;
    velocity[i * 2] = vx;
    velocity[i * 2 + 1] = vy;
    ttl[i] = seconds;
    life[i] = 1;
    sizes[i] = size;
    tints.set(tint, i * 3);
    clicked[i] = isClick;
  }
  function burst(center, reduced) {
    burstAge = 0;
    shock.position.set(center.x, center.y, 0);
    if (reduced) return;
    for (let i = 0; i < 200; i++) {
      const a = i * 2.39996,
        v = 0.25 + Math.random() * 1.05;
      emit(
        center.x,
        center.y,
        Math.cos(a) * v,
        Math.sin(a) * v,
        3 + Math.random() * 6,
        [0.52 + Math.random() * 0.3, 0.9, 1],
        0.7 + Math.random() * 0.7,
      );
    }
  }
  return {
    configure(options = {}) {
      effects.configure(options);
      clickOptions = options;
      const { color: tint, particles = true, bloom = true, particleDensity = 1 } = options;
      particleEnabled = particles && particleDensity > 0;
      bloomEnabled = bloom;
      sparks.visible = particleEnabled;
      if (!particleEnabled || options.reducedMotion) life.fill(0);
      if (tint) {
        color.set(tint);
        for (const halo of [...palms, orbGlow, shock]) halo.material.uniforms.uColor.value.copy(color);
        shell.material.color.copy(color);
        orbits.forEach(o => o.material.color.copy(color));
        sparks.material.uniforms.uTint.value.copy(color);
      }
      for (const halo of [...palms, orbGlow]) halo.visible = bloom;
    },
    click(x, y) {
      if (!particleEnabled || clickOptions.clickEffect === 'none' || !Number.isFinite(x + y)) return;
      const duration = clickOptions.clickDuration ?? 1,
        intensity = clickOptions.clickIntensity ?? 1,
        radius = clickOptions.clickRadius ?? 0.5,
        count = Math.floor(200 * (clickOptions.particleDensity ?? 1));
      if (intensity === 0) return;
      aspect = innerWidth / innerHeight;
      camera.left = -aspect;
      camera.right = aspect;
      camera.updateProjectionMatrix();
      if (clickOptions.reducedMotion || clickOptions.clickEffect === 'wave') {
        clickGlowAge = 0;
        clickGlowDuration = Math.min(0.6, duration);
        clickGlowIntensity = intensity;
        clickGlow.position.set(x * aspect, y, 0);
        clickGlow.scale.setScalar(Math.min(0.8, radius) * 0.65);
        const tint = clickGlow.material.uniforms.uColor.value;
        if (clickOptions.particleColorMode === 'rainbow') tint.setHSL(Math.random(), 0.85, 0.65);
        else
          tint.set(
            clickOptions.particleColorMode === 'palette'
              ? clickOptions.particlePalette?.[0] || '#66efbc'
              : clickOptions.color || '#66efbc',
          );
      }
      if (clickOptions.reducedMotion || !['wave', 'burst'].includes(clickOptions.clickEffect)) return;
      const slot = (clickCursor++ % 4) + 1;
      for (let i = 0; i < max; i++) if (clicked[i] === slot) life[i] = 0;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.39996,
          speed = (radius / duration) * intensity * (clickOptions.clickEffect === 'burst' ? 0.3 + Math.random() : 1);
        emit(
          x * aspect,
          y,
          Math.cos(angle) * speed * aspect,
          Math.sin(angle) * speed,
          3 + Math.random() * 4,
          [1, 1, 1],
          duration,
          slot,
        );
      }
    },
    state: () => ({
      ...latest,
      hands: lastPoints.size,
      active: enabled,
      clickParticles: life.reduce((sum, v, i) => sum + (v > 0 && clicked[i] ? 1 : 0), 0),
      clickGlow: clickGlow.visible,
      effects: effects.state(),
    }),
    update({ now, dt, hands, project, active, present, demo, reducedMotion, online, framing }) {
      effects.update(now / 1000);
      clickGlowAge += dt;
      clickGlow.visible = particleEnabled && clickGlowAge < clickGlowDuration;
      clickGlow.material.uniforms.uAlpha.value =
        Math.max(0, 1 - clickGlowAge / clickGlowDuration) * clickGlowIntensity * 0.7;
      enabled = active;
      root.hidden = !active;
      if (lastDemo !== demo) {
        gesture.reset();
        lastPoints.clear();
        life.fill(0);
        burstAge = 10;
        orbAmount = 0;
        lastDemo = demo;
      }
      if (!active) {
        gesture.reset();
        lastPoints.clear();
        orbAmount = 0;
        burstAge = 10;
        orb.visible = shock.visible = false;
        for (const halo of [...palms, orbGlow]) halo.material.uniforms.uAlpha.value = 0;
        for (let i = 0; i < max; i++)
          if (life[i] > 0) {
            if (!clicked[i]) life[i] = 0;
            else {
              life[i] = Math.max(0, life[i] - dt / ttl[i]);
              pos[i * 3] += velocity[i * 2] * dt;
              pos[i * 3 + 1] += velocity[i * 2 + 1] * dt;
            }
          }
        for (const attr of Object.values(geometry.attributes)) attr.needsUpdate = true;
        return;
      }
      aspect = innerWidth / innerHeight;
      camera.left = -aspect;
      camera.right = aspect;
      camera.updateProjectionMatrix();
      if (now - lastNow > 350) lastPoints.clear();
      lastNow = now;
      latest = gesture.update(hands, now);
      const nextPoints = new Map();
      hands.forEach((hand, i) => {
        const projected = project?.(hand),
          p = point(projected ? { sx: projected.x, sy: projected.y } : hand),
          previous = lastPoints.get(hand.id) ?? p;
        nextPoints.set(hand.id, p);
        palms[i].position.set(p.x, p.y, 0);
        palms[i].scale.setScalar(hand.pinched ? 0.15 : 0.115);
        palms[i].material.uniforms.uAlpha.value = hand.pinched ? 1.6 : 1;
        if (!reducedMotion && particleEnabled) {
          const travel = p.distanceTo(previous),
            count = Math.min(32, Math.max(1, Math.ceil(dt * 100 + travel * 90)));
          for (let n = 0; n < count; n++) {
            const a = n / count;
            emit(
              previous.x + (p.x - previous.x) * a,
              previous.y + (p.y - previous.y) * a,
              (Math.random() - 0.5) * 0.07,
              (Math.random() - 0.5) * 0.07,
              2 + Math.random() * 5,
              i ? [0.48, 0.72, 1] : [0.5, 1, 0.79],
              0.45 + Math.random() * 0.55,
            );
          }
        }
      });
      for (let i = hands.length; i < 2; i++) palms[i].material.uniforms.uAlpha.value = 0;
      const points = [...nextPoints.values()],
        mid = new THREE.Vector2();
      for (const p of points) mid.add(p);
      if (points.length) mid.multiplyScalar(1 / points.length);
      if (latest.released) burst(mid, reducedMotion);
      const wanted = latest.charge > 0 ? latest.charge : 0;
      orbAmount += (wanted - orbAmount) * (1 - Math.exp(-dt * 12));
      const radius =
        0.08 +
        orbAmount * 0.12 +
        (latest.phase === 'holding' && points.length === 2 ? points[0].distanceTo(points[1]) * 0.15 : 0);
      orb.visible = orbAmount > 0.005;
      orb.position.set(mid.x, mid.y, 0);
      orb.scale.setScalar(radius);
      if (!reducedMotion) {
        orb.rotation.y += dt * 0.6;
        orb.rotation.z += dt * 0.24;
        orbits.forEach((o, i) => (o.rotation.z += dt * (i + 1) * 0.2));
      }
      shell.material.opacity = orbAmount * 0.7;
      orbits.forEach(o => (o.material.opacity = orbAmount * 0.8));
      orbGlow.position.copy(orb.position);
      orbGlow.scale.setScalar(radius * 2.8);
      orbGlow.material.uniforms.uAlpha.value = orbAmount * 1.1;
      burstAge += dt;
      shock.visible = bloomEnabled && burstAge < 1.6;
      shock.scale.setScalar(reducedMotion ? 0.25 : 0.12 + burstAge * 1.7);
      shock.material.uniforms.uAlpha.value = Math.max(0, 1 - burstAge / 1.6) * (reducedMotion ? 0.25 : 0.6);
      for (let i = 0; i < max; i++)
        if (life[i] > 0) {
          life[i] = Math.max(0, life[i] - dt / ttl[i]);
          pos[i * 3] += velocity[i * 2] * dt;
          pos[i * 3 + 1] += velocity[i * 2 + 1] * dt;
        }
      for (const attr of Object.values(geometry.attributes)) attr.needsUpdate = true;
      lastPoints = nextPoints;
      const text =
        latest.phase === 'holding'
          ? 'Sepáralas.'
          : latest.phase === 'charging'
            ? 'Siente la energía.'
            : burstAge < 1.6
              ? 'Tu energía. Sin límites.'
              : hands.length === 2
                ? 'Junta las manos.'
                : hands.length
                  ? 'Mueve las manos.'
                  : present
                    ? 'El reflejo eres tú.'
                    : framing
                      ? 'Da un paso atrás.'
                      : online
                        ? 'Entra en escena.'
                        : 'Visión 3D';
      if (cue.textContent !== text) cue.textContent = text;
      demoLabel.hidden = !demo;
      root.classList.toggle('engaged', latest.charge > 0);
    },
    render(renderer) {
      if (!enabled && !life.some(v => v > 0) && !clickGlow.visible) return;
      sparks.material.uniforms.uPixel.value = renderer.getPixelRatio() * Math.max(0.8, innerHeight / 1000);
      const old = renderer.autoClear;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = old;
    },
  };
}
