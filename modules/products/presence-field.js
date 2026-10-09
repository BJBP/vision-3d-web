// Campo de presencia de la galería: superficie de partículas esculpida a partir de la máscara
// de la persona y estelas que siguen a las manos. createPresenceField() devuelve el objeto 3D.
import * as THREE from 'three';
import { createParticleEffects, PARTICLE_VERTEX_GLSL, PARTICLE_FRAGMENT_GLSL } from '../effects/index.js';

// One foreground mask, shared with the avatar. The small binary mask is given
// a sculpted particle surface; it is not treated as measured 3D body geometry.
export function createPresenceField() {
  const effects = createParticleEffects();
  const scene = new THREE.Scene(),
    foregroundScene = new THREE.Scene(),
    camera = new THREE.Camera();
  const empty = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat);
  empty.needsUpdate = true;
  const HISTORY = 12,
    AMBIENT = 18000,
    BODY = 256 * 144,
    HAND = 1536,
    count = AMBIENT + BODY + HAND * 2;
  const U = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uPixel: { value: 1 },
    uSil: { value: empty },
    uBody: { value: 0 },
    uInspect: { value: 0 },
    uMotion: { value: 1 },
    uTrailsEnabled: { value: 1 },
    uColor: { value: new THREE.Color(0.2, 0.64, 0.32) },
    ...effects.uniforms,
    uHands: { value: [new THREE.Vector3(-2, -2, 0), new THREE.Vector3(-2, -2, 0)] },
    uVelocity: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uTrails: { value: Array.from({ length: HISTORY * 2 }, () => new THREE.Vector4(-2, -2, 0, 0)) },
  };
  let observed = -Infinity,
    clock = 0,
    reduced = false,
    density = 1,
    backgroundKey = null,
    backgroundTexture = null,
    particleEnabled = true,
    trailEnabled = true;
  let seed = 92831;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(count * 3),
    kinds = new Float32Array(count),
    links = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const j = i * 3;
    if (i < AMBIENT) {
      positions[j] = ((i % 225) + random() * 0.7) / 225;
      positions[j + 1] = (Math.floor(i / 225) + random() * 0.7) / 80;
      positions[j + 2] = random();
    } else if (i < AMBIENT + BODY) {
      const cell = i - AMBIENT;
      positions[j] = ((cell % 256) + random() * 0.6) / 256;
      positions[j + 1] = (Math.floor(cell / 256) + random() * 0.6) / 144;
      positions[j + 2] = random();
      kinds[i] = 1;
    } else {
      const cell = i - AMBIENT - BODY;
      positions[j] = ((cell % HAND) + 0.5) / HAND;
      positions[j + 1] = random();
      positions[j + 2] = random();
      kinds[i] = 2 + Math.floor(cell / HAND);
    }
  }
  const vertexShader = `
    ${PARTICLE_VERTEX_GLSL}
    uniform float uTime,uAspect,uPixel,uBody,uInspect,uMotion,uTrailsEnabled;
    uniform vec3 uColor;
    uniform sampler2D uSil;
    uniform vec3 uHands[2],uVelocity[2];
    uniform vec4 uTrails[24];
    attribute float aKind;attribute vec2 aLink;
    varying vec3 vColor;varying float vAlpha;
    const float PI=3.14159265359;
    vec3 screen(vec2 uv){return vec3((uv.x-.5)*2.*uAspect,(.5-uv.y)*2.,0.);}
    void main(){
      float q=position.z,pointSize=1.,body=step(.5,aKind)*(1.-step(1.5,aKind))+step(3.5,aKind);
      vec3 p=vec3(0.);vAlpha=0.;
      vec3 green=uColor,silver=mix(uColor,vec3(1.),.60);
      if(aKind<.5){
        // A twisted cloud occupies a volume, not screen-space sine ribbons.
        // Coherent meridians and layered depth keep it legible as one surface.
        float a=position.x*PI*2.+uTime*.022;
        float b=position.y*PI*2.+sin(a*3.+uTime*.09)*.46;
        float section=.12+.17*q;
        float radial=1.+cos(b)*section+.105*sin(a*3.+b*.7+uTime*.07);
        p=vec3(cos(a)*radial*uAspect*.78,sin(a)*radial*.68,sin(b)*section+.24*cos(a*2.+uTime*.08));
        p.y+=.10*sin(a*2.+b*.5+uTime*.10);
        float filaments=pow(.5+.5*cos(b*12.+a*2.),9.);
        float depth=smoothstep(-.52,.48,p.z);
        vColor=mix(green*.55,silver,filaments*.54+depth*.18);
        vAlpha=(.08+.21*filaments+.11*q)*(.48+.52*depth)*1.7;
        pointSize=(1.+q*.85)*(1.+p.z*.4);
      }else if(body>.5){
        vec2 uv=position.xy;
        float mask=texture2D(uSil,uv).r;
        float dx=texture2D(uSil,uv+vec2(1./96.,0.)).r-texture2D(uSil,uv-vec2(1./96.,0.)).r;
        float dy=texture2D(uSil,uv+vec2(0.,1./54.)).r-texture2D(uSil,uv-vec2(0.,1./54.)).r;
        float rim=clamp(length(vec2(dx,dy))*1.5,0.,1.);
        p=screen(uv);
        p.z=(mask-.5)*.13+(q-.5)*.045;
        p.xy+=vec2(dx,-dy)*.012;
        p.z+=sin(uv.y*17.+uTime*.3)*.006*uMotion;
        vAlpha=smoothstep(.12,.64,mask)*uBody*(.25+q*.24+rim*.45);
        vColor=mix(green,silver,.20+rim*.60+q*.14);
        pointSize=1.05+q*.75+rim*.45;
        if(aKind>3.5){vAlpha*=smoothstep(.18,.65,texture2D(uSil,aLink).r)*.26;}
      }else{
        int hand=aKind<2.5?0:1;
        int base=hand*12;
        float t=position.x;
        float along=max(0.,(t-.18)/.82)*11.;
        int index=int(floor(along));
        vec4 previous=uTrails[base+index],next=uTrails[base+min(index+1,11)];
        vec4 trace=mix(previous,next,fract(along));
        float energy=uVelocity[hand].z;
        float angle=position.y*PI*2.+uTime*(.18+energy*.7);
        p=screen(trace.xy);
        if(t<.18){
          // A small, faceted particle nucleus follows the actual hand. No
          // constant wire circle obscures its position or resembles a button.
          p=screen(uHands[hand].xy);
          float z=q*2.-1.,r=sqrt(max(0.,1.-z*z));
          float size=.045+energy*.045;
          p+=vec3(cos(angle)*r,sin(angle)*r,z)*size;
          vAlpha=(.33+q*.34)*uHands[hand].z;
          vColor=mix(green,silver,.70+q*.25)*1.2;
          pointSize=1.6+q*.9;
        }else{
          vec2 tangent=(next.xy-previous.xy)*vec2(uAspect,-1.);
          tangent=normalize(tangent+vec2(.00001,0.));
          vec2 normal=vec2(-tangent.y,tangent.x);
          float width=(.025+trace.z*.10)*(1.-t*.58);
          p.xy+=normal*cos(angle+along*.6)*width;
          p.z=sin(angle+along*.6)*width;
          // The gently curled wake remains behind a moving hand and dissipates
          // in less than a second, making direction and release visible.
          p.xy+=normal*sin(along*.55+uTime*.5)*width*.6;
          vAlpha=trace.w*trace.z*(1.-t)*(.54+.50*q)*uHands[hand].z*uMotion*uTrailsEnabled;
          vColor=mix(green,silver,pow(1.-t,3.)*.7)*1.2;
          pointSize=1.45+q*.90;
        }
      }
      if(aKind<1.5||aKind>3.5){
        for(int i=0;i<2;i++){
          vec3 hand=screen(uHands[i].xy);
          vec2 delta=p.xy-hand.xy;
          float distanceToHand=length(delta);
          float influence=exp(-distanceToHand*distanceToHand*5.8)*uHands[i].z;
          vec2 direction=normalize(delta+vec2(.00001,0.));
          vec2 tangent=vec2(-direction.y,direction.x);
          float energy=uVelocity[i].z;
          p.xy+=(tangent*(.018+energy*.090)+direction*energy*.075)*influence*uMotion;
          p.xy+=uVelocity[i].xy*vec2(1.,-1.)*influence*.035*uMotion;
          p.z+=sin(distanceToHand*15.-uTime*1.5)*energy*influence*.055*uMotion;
          vColor=mix(vColor,silver,influence*(.16+energy*.44));
          vAlpha+=influence*(.04+energy*.19)*(aKind<.5?1.:uBody);
        }
      }
      float perspective=2.8/(2.8-p.z);
      if(aKind<1.5)p=particlePosition(p,q,aKind<.5?0.:1.);
      vColor=particleColor(vColor,q,p);
      vec2 projected=p.xy*perspective;
      vec2 screenPoint=vec2(projected.x/uAspect,projected.y);
      // Keep the central 3D object readable. Hands retain a small visible core.
      if(aKind<1.5||aKind>3.5){
        float emptyCenter=smoothstep(.19,.80,length(screenPoint*vec2(.88,1.)));
        vAlpha*=mix(.20+.80*emptyCenter,.025+.20*emptyCenter,uInspect);
      }else vAlpha*=mix(1.,.78,uInspect);
      gl_Position=vec4(particleDisplace(vec3(screenPoint,clamp(.78-p.z*.12,-.9,.99))),1.);
      gl_PointSize=max(.75,pointSize*perspective*uPixel*uParticleSize);
    }`;
  function material(lines = false) {
    return new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexShader,
      fragmentShader: lines
        ? `varying vec3 vColor;varying float vAlpha;void main(){gl_FragColor=vec4(vColor,vAlpha);}`
        : `${PARTICLE_FRAGMENT_GLSL} varying vec3 vColor;varying float vAlpha;void main(){float mask=particleMask(gl_PointCoord);if(mask<.002||vAlpha<.002)discard;gl_FragColor=vec4(vColor,vAlpha*mask);}`,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute('aLink', new THREE.BufferAttribute(links, 2));
  geometry.setDrawRange(0, AMBIENT + BODY);
  const pointMaterial = material(),
    points = new THREE.Points(geometry, pointMaterial);
  points.frustumCulled = false;
  scene.add(points);
  // Draw the hand response after the solid panels/products. Share attributes
  // and uniforms; only its draw range changes, so no particles are duplicated.
  const handGeometry = new THREE.BufferGeometry();
  for (const name of ['position', 'aKind', 'aLink']) handGeometry.setAttribute(name, geometry.getAttribute(name));
  handGeometry.setDrawRange(AMBIENT + BODY, HAND * 2);
  const handPoints = new THREE.Points(handGeometry, pointMaterial);
  handPoints.frustumCulled = false;
  foregroundScene.add(handPoints);

  // Sparse triangular connections belong to the measured foreground only.
  // Both endpoints sample the mask, so no wire stretches across empty space.
  const wirePositions = [],
    wireLinks = [],
    wireKinds = [];
  for (let y = 1; y < 27; y++)
    for (let x = 1; x < 48; x++) {
      const uv = [x / 48, y / 27];
      for (const to of [
        [(x + 1) / 48, y / 27],
        [(x + (y % 2 ? 1 : 0)) / 48, (y + 1) / 27],
      ]) {
        const q = random();
        wirePositions.push(...uv, q, ...to, q);
        wireLinks.push(...to, ...uv);
        wireKinds.push(4, 4);
      }
    }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
  wireGeometry.setAttribute('aKind', new THREE.Float32BufferAttribute(wireKinds, 1));
  wireGeometry.setAttribute('aLink', new THREE.Float32BufferAttribute(wireLinks, 2));
  const wire = new THREE.LineSegments(wireGeometry, material(true));
  wire.frustumCulled = false;
  scene.add(wire);

  function configure(options = {}) {
    effects.configure(options);
    const {
      background,
      bgColor = '#030806',
      bgEnd = '#102d20',
      color,
      particles = true,
      particleDensity = 1,
      trails = true,
      backgroundTexture: sharedBackground = null,
      backgroundIntensity = 1,
    } = options;
    scene.backgroundIntensity = backgroundIntensity;
    if (background === 'video') {
      backgroundTexture?.dispose();
      backgroundTexture = null;
      backgroundKey = null;
      scene.background = sharedBackground;
    }
    if (background && background !== 'video') {
      const key = JSON.stringify([background, bgColor, bgEnd]);
      if (key !== backgroundKey) {
        if (background === 'gradient') {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 256;
          const context = canvas.getContext('2d'),
            gradient = context.createLinearGradient(0, 0, 0, 256);
          gradient.addColorStop(0, bgColor);
          gradient.addColorStop(1, bgEnd);
          context.fillStyle = gradient;
          context.fillRect(0, 0, 1, 256);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          scene.background = texture;
          backgroundTexture?.dispose();
          backgroundTexture = texture;
        } else {
          scene.background = new THREE.Color(bgColor);
          backgroundTexture?.dispose();
          backgroundTexture = null;
        }
        backgroundKey = key;
      }
    }
    if (color) U.uColor.value.set(color);
    particleEnabled = particles;
    trailEnabled = trails;
    points.visible = handPoints.visible = wire.visible = particles;
    U.uTrailsEnabled.value = trails ? 1 : 0;
    const next = Number.isFinite(particleDensity) ? THREE.MathUtils.clamp(particleDensity, 0, 1) : 1;
    if (next === density) return;
    density = next;
    // Sample every region uniformly: truncating the first vertices would erase
    // the body and crop the organized surface instead of reducing its density.
    for (const [geo, regions, unit] of [
      [
        geometry,
        [
          [0, AMBIENT],
          [AMBIENT, BODY],
        ],
        1,
      ],
      [
        handGeometry,
        [
          [AMBIENT + BODY, HAND],
          [AMBIENT + BODY + HAND, HAND],
        ],
        1,
      ],
      [wireGeometry, [[0, wirePositions.length / 3]], 2],
    ]) {
      if (!geo.index)
        geo.setIndex(
          new THREE.BufferAttribute(new Uint16Array(regions.reduce((sum, [, length]) => sum + length, 0)), 1).setUsage(
            THREE.DynamicDrawUsage,
          ),
        );
      const indices = geo.index.array;
      let cursor = 0;
      for (const [start, length] of regions) {
        const total = length / unit,
          size = Math.floor(total * density);
        for (let i = 0; i < size; i++) {
          const at = start + Math.floor((i * total) / size) * unit;
          for (let j = 0; j < unit; j++) indices[cursor++] = at + j;
        }
      }
      geo.index.needsUpdate = true;
      geo.setDrawRange(0, cursor);
    }
  }

  const channels = Array.from({ length: 2 }, () => ({
    id: null,
    lastObserved: -Infinity,
    lastTrail: -Infinity,
    inputX: 0,
    inputY: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    energy: 0,
    history: [],
  }));
  function resetChannel(channel, index) {
    channel.id = null;
    channel.lastObserved = -Infinity;
    channel.lastTrail = -Infinity;
    channel.vx = 0;
    channel.vy = 0;
    channel.energy = 0;
    channel.history.length = 0;
    U.uHands.value[index].set(-2, -2, 0);
    U.uVelocity.value[index].set(0, 0, 0);
    for (let j = 0; j < HISTORY; j++) U.uTrails.value[index * HISTORY + j].set(-2, -2, 0, 0);
  }
  function clear() {
    observed = -Infinity;
    U.uBody.value = 0;
    channels.forEach(resetChannel);
  }
  function update({ now, dt, hands = [], reducedMotion = false, inspect = false }) {
    effects.update(now / 1000);
    const elapsed = Math.min(0.25, Math.max(0, dt));
    reduced = reducedMotion;
    if (!reducedMotion) clock += elapsed;
    U.uTime.value = clock;
    U.uMotion.value = reducedMotion ? 0 : 1;
    U.uAspect.value = innerWidth / innerHeight;
    U.uInspect.value = inspect ? 1 : 0;
    const liveBody = now - observed < 500;
    U.uBody.value = liveBody ? U.uBody.value + (1 - U.uBody.value) * (1 - Math.exp(-elapsed * 14)) : 0;
    const fresh = hands
        .filter(
          h =>
            Number.isFinite(h.sx) &&
            Number.isFinite(h.sy) &&
            Number.isFinite(h.observedAt) &&
            now - h.observedAt < 300 &&
            h.observedAt <= now + 20,
        )
        .slice(0, 2),
      claimed = new Set();
    const matches = channels.map(c => fresh.find(h => h.id === c.id));
    matches.forEach(h => {
      if (h) claimed.add(h.id);
    });
    for (let i = 0; i < 2; i++) {
      const c = channels[i],
        h = matches[i] ?? fresh.find(h => !claimed.has(h.id));
      if (!h) {
        resetChannel(c, i);
        continue;
      }
      claimed.add(h.id);
      if (c.id !== h.id) {
        resetChannel(c, i);
        c.id = h.id;
        c.inputX = c.x = h.sx;
        c.inputY = c.y = h.sy;
        c.lastObserved = h.observedAt;
      }
      if (h.observedAt !== c.lastObserved) {
        const seconds = Math.max(0.025, Math.min(0.35, (h.observedAt - c.lastObserved) / 1000));
        const vx = ((h.sx - c.inputX) * U.uAspect.value) / seconds,
          vy = (h.sy - c.inputY) / seconds;
        const limit = Math.max(1, Math.hypot(vx, vy) / 3),
          blend = 1 - Math.exp(-seconds * 10);
        c.vx += (vx / limit - c.vx) * blend;
        c.vy += (vy / limit - c.vy) * blend;
        c.inputX = h.sx;
        c.inputY = h.sy;
        c.lastObserved = h.observedAt;
      }
      // The nucleus tracks directly in calm mode; normal mode adds only a short
      // easing interval, while the wake carries the visible inertia.
      const follow = reducedMotion ? 1 : 1 - Math.exp(-elapsed * 24);
      c.x += (h.sx - c.x) * follow;
      c.y += (h.sy - c.y) * follow;
      if (now - c.lastObserved > 100) {
        const decay = Math.exp(-elapsed * 8);
        c.vx *= decay;
        c.vy *= decay;
      }
      c.energy = reducedMotion ? 0 : Math.min(1, Math.hypot(c.vx, c.vy) * 0.65);
      U.uHands.value[i].set(c.x, c.y, 1);
      U.uVelocity.value[i].set(reducedMotion ? 0 : c.vx, reducedMotion ? 0 : c.vy, c.energy);
      if (now - c.lastTrail >= 40) {
        c.history.unshift({ x: c.x, y: c.y, energy: c.energy, time: now });
        c.history.length = Math.min(HISTORY, c.history.length);
        c.lastTrail = now;
      }
      for (let j = 0; j < HISTORY; j++) {
        const sample = c.history[Math.min(j, c.history.length - 1)];
        const alpha = sample ? Math.max(0, 1 - (now - sample.time) / 780) : 0;
        U.uTrails.value[i * HISTORY + j].set(
          sample?.x ?? c.x,
          sample?.y ?? c.y,
          sample?.energy ?? 0,
          reducedMotion ? 0 : alpha,
        );
      }
    }
  }
  return {
    scene,
    camera,
    foreground: { scene: foregroundScene, camera },
    configure,
    click: effects.click,
    prepare(renderer) {
      U.uPixel.value = renderer.getPixelRatio();
    },
    ingest(texture, now) {
      U.uSil.value = texture;
      observed = now;
    },
    clear,
    update,
    state() {
      return {
        silhouette: U.uBody.value > 0.05,
        particles: particleEnabled ? geometry.drawRange.count + handGeometry.drawRange.count : 0,
        effects: effects.state(),
        volume: true,
        hands: channels.filter(c => c.id !== null).length,
        energy: Number(Math.max(...channels.map(c => c.energy)).toFixed(3)),
        trails:
          reduced || !trailEnabled || !particleEnabled
            ? 0
            : U.uTrails.value.filter(t => t.w > 0.05 && t.z > 0.04).length,
      };
    },
    render(renderer) {
      U.uPixel.value = renderer.getPixelRatio();
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      renderer.render(scene, camera);
      renderer.render(foregroundScene, camera);
      renderer.autoClear = auto;
    },
  };
}
