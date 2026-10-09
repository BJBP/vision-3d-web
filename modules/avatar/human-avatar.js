// Avatar humano realista (neutral, femenino, masculino) con acabados natural, escultura u
// holograma. createHumanAvatar(uniforms, scale, appearance) carga la malla de web/assets/human.
import * as THREE from 'three';

export const APPEARANCES = ['neutral', 'feminine', 'masculine'];
export const FINISHES = ['natural', 'sculpture', 'hologram'];
const FRAGMENT = /* glsl */ `
  uniform vec3 uMagic,uSkin;uniform float uStage,uSurface,uFinish,uTime,uMotion;
  uniform float uNeckY,uHipY,uMouthY;uniform vec3 uEye;
  varying vec3 vNormal,vWorld,vLocal,vDetail;varying float vVis;
  float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    // Tracking confidence must not turn a solid person into persistent stippled holes.
    float reveal=smoothstep(1.38,1.98,uStage)*uSurface;
    if(reveal<.001 || (reveal<.995 && hash(floor(gl_FragCoord.xy))>reveal))discard;
    vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
    vec3 view=normalize(cameraPosition-vWorld);
    vec3 key=normalize(vec3(-.45,.68,1.2)),fill=normalize(vec3(.8,.25,.8));
    float d=max(0.,dot(n,key)),f=max(0.,dot(n,fill));
    float wrapped=clamp((dot(n,key)+.4)/1.4,0.,1.);
    float rim=pow(1.-abs(dot(n,view)),3.2);
    float gloss=pow(max(0.,dot(n,normalize(key+view))),42.);
    float wide=pow(max(0.,dot(n,normalize(key+view))),12.);
    float part=vDetail.z;
    // Define the collar continuously in surface coordinates, not by vertex labels.
    // Hands retain their own skin region outside the torso.
    if(part<1.5 && abs(vLocal.x)<.18)part=step(uNeckY-.027,vLocal.y);
    vec3 color;
    if(part<.5){
      // Tailored dark jacket, ivory shirt and trousers. Clothing is never classified from a visitor.
      vec3 cloth=vec3(.018,.031,.028);
      float chest=step(uHipY+.20,vLocal.y)*step(.04,vLocal.z);
      float opening=max(0.,(vLocal.y-uNeckY+.22)*.35);
      float shirt=chest*(1.-smoothstep(opening,opening+.004,abs(vLocal.x)));
      cloth=mix(cloth,vec3(.29,.275,.24),shirt);
      float lapel=chest*step(uNeckY-.22,vLocal.y)*(1.-smoothstep(.001,.004,abs(abs(vLocal.x)-opening-.028)));
      cloth+=vec3(.055,.06,.05)*lapel;
      float weave=.96+.04*sin(vLocal.x*2800.)*sin(vLocal.y*2800.);
      color=cloth*(.28+.85*d+.24*f)*weave+vec3(.014,.018,.016)*wide+uMagic*rim*.08;
    }else if(part<1.5){
      vec3 skin=uSkin;
      // Warm lip pigmentation follows the real mouth area, with a subtle cheek tint.
      float lips=exp(-pow(vLocal.x/.023,4.)-pow((vLocal.y-uMouthY)/.006,4.))*smoothstep(uEye.z-.025,uEye.z+.012,vLocal.z);
      skin=mix(skin,skin*vec3(.82,.47,.44),lips*.60);
      float blush=exp(-pow((abs(vLocal.x)-.045)/.025,2.)-pow((vLocal.y-uEye.y+.021)/.021,2.));
      skin=mix(skin,skin*vec3(1.06,.88,.85),blush*.16);
      color=skin*(.25+.78*wrapped+.16*f)+vec3(1.,.91,.80)*gloss*.055;
      color+=skin*vec3(.16,.048,.02)*pow(max(0.,dot(-key,n)),2.);
      color+=vec3(.20,.16,.11)*rim*.17;
      if(uFinish>.5 && uFinish<1.5){
        color=vec3(.64,.60,.50)*(.22+.75*wrapped)+vec3(.72,.48,.19)*gloss*.3+vec3(.32,.23,.11)*rim;
      }
      if(uFinish>1.5)color=vec3(.045,.09,.07)+uMagic*(.17+.3*d+.48*rim)+vec3(.4,.7,.55)*gloss*.22;
    }else if(part>2.5 && part<3.5){
      // Sculpted hair volume with fine directional highlights, not a shiny helmet.
      float strands=.82+.18*sin(vLocal.x*4200.+sin(vLocal.y*45.)*6.);
      color=vec3(.030,.019,.012)*(.5+1.5*d)*strands+vec3(.13,.09,.048)*wide*.5+vec3(.15,.12,.065)*rim*.3;
      if(uFinish>.5 && uFinish<1.5)color=vec3(.17,.105,.035)*(.4+.9*d)+vec3(.31,.20,.07)*gloss;
      if(uFinish>1.5)color=uMagic*(.045+.17*rim+.06*d);
    }else if(part>3.5 && part<4.5){
      float r=length(vDetail.xy),iris=1.-smoothstep(.44,.49,r),pupil=1.-smoothstep(.17,.21,r);
      float angle=atan(vDetail.y,vDetail.x),fibers=.6+.4*sin(angle*64.+r*19.);
      vec3 sclera=vec3(.65,.64,.59),irisCol=mix(vec3(.055,.034,.013),vec3(.21,.15,.055),fibers);
      irisCol*=.5+.5*smoothstep(.21,.36,r);irisCol*=1.-.65*smoothstep(.40,.48,r);
      color=mix(sclera,irisCol,iris);color=mix(color,vec3(.002,.003,.002),pupil);
      color*=.30+.75*d+.15*f;
      color+=vec3(.8,.86,.82)*pow(max(0.,dot(n,normalize(key+view))),180.)*.7;
    }else color=vec3(.028,.018,.012)*(.45+.7*d);
    gl_FragColor=vec4(color,1.);
  }
`;

async function loadModel(name, shared, scale) {
  const [br, jr] = await Promise.all([fetch(`./assets/human/${name}.bin`), fetch(`./assets/human/${name}.json`)]);
  if (!br.ok || !jr.ok) throw new Error(`No se pudo cargar la apariencia ${name}.`);
  const [buffer, meta] = await Promise.all([br.arrayBuffer(), jr.json()]);
  const header = new DataView(buffer),
    count = header.getUint32(0, true),
    icount = header.getUint32(4, true),
    stride = header.getUint32(8, true);
  if (stride !== 17 || buffer.byteLength !== 12 + count * stride * 4 + icount * 4 || icount % 3)
    throw new Error('Malla humana inválida.');
  const data = new THREE.InterleavedBuffer(new Float32Array(buffer, 12, count * stride), stride),
    geo = new THREE.BufferGeometry();
  for (const [attr, size, off] of [
    ['position', 3, 0],
    ['normal', 3, 3],
    ['skinIndex', 4, 6],
    ['skinWeight', 4, 10],
    ['aDetail', 3, 14],
  ])
    geo.setAttribute(attr, new THREE.InterleavedBufferAttribute(data, size, off));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, 12 + count * stride * 4, icount), 1));
  const bones = meta.bones,
    matrices = bones.map(() => new THREE.Matrix4()),
    visibility = Array.from({ length: Math.ceil(bones.length / 4) }, () => new THREE.Vector4());
  const uniforms = {
    ...shared,
    uBones: { value: matrices },
    uBoneVis: { value: visibility },
    uEye: { value: new THREE.Vector3(...meta.eye) },
    uEyeHalfWidth: { value: meta.eyeHalfWidth },
    uMouthY: { value: meta.mouthY },
    uNeckY: { value: meta.neckY },
    uHipY: { value: meta.hipY },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    fragmentShader: FRAGMENT,
    vertexShader: /* glsl */ `
    uniform mat4 uBones[${bones.length}];uniform vec4 uBoneVis[${visibility.length}];uniform float uScale,uEyeOpen,uEyeHalfWidth;uniform vec3 uEye;
    attribute vec4 skinIndex,skinWeight;attribute vec3 aDetail;
    varying vec3 vNormal,vWorld,vLocal,vDetail;varying float vVis;
    float confidence(int i){return uBoneVis[i/4][i-4*(i/4)];}
    void main(){
      mat4 skin=uBones[int(skinIndex.x)]*skinWeight.x+uBones[int(skinIndex.y)]*skinWeight.y+
        uBones[int(skinIndex.z)]*skinWeight.z+uBones[int(skinIndex.w)]*skinWeight.w;
      vec3 local=position;
      // Authored demo blink, independent of body tracking; live capture keeps eyes open.
      float blink=1.-uEyeOpen;
      if(aDetail.z>3.5 && aDetail.z<4.5)local.y=uEye.y+(local.y-uEye.y)*max(.02,uEyeOpen);
      if(aDetail.z>.5 && aDetail.z<1.5){
        float eyelid=exp(-pow((abs(local.x)-uEyeHalfWidth)/.016,4.)-pow((local.y-uEye.y)/.017,4.));
        eyelid*=smoothstep(uEye.z-.001,uEye.z+.009,local.z);
        local.y-=(local.y-uEye.y)*blink*eyelid;
      }
      vec4 p=skin*vec4(local*uScale,1.);
      vNormal=normalize(mat3(modelMatrix)*mat3(skin)*normal);vWorld=(modelMatrix*p).xyz;
      vLocal=position;vDetail=aDetail;
      vVis=confidence(int(skinIndex.x))*skinWeight.x+confidence(int(skinIndex.y))*skinWeight.y+
        confidence(int(skinIndex.z))*skinWeight.z+confidence(int(skinIndex.w))*skinWeight.w;
      gl_Position=projectionMatrix*modelViewMatrix*p;
    }
  `,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  const axis = new THREE.Vector3(0, 1, 0),
    direction = new THREE.Vector3(),
    size = new THREE.Vector3(),
    q = new THREE.Quaternion();
  const basis = new THREE.Matrix4(),
    right = new THREE.Vector3(),
    up = new THREE.Vector3(),
    front = new THREE.Vector3();
  const rests = bones.map(b => {
    const a = new THREE.Vector3(...b.from).multiplyScalar(scale),
      delta = new THREE.Vector3(...b.to).multiplyScalar(scale).sub(a);
    const rotation =
      b.kind === 'head'
        ? new THREE.Quaternion()
        : new THREE.Quaternion().setFromUnitVectors(axis, delta.clone().normalize());
    return {
      length: delta.length(),
      direction: delta.clone().normalize(),
      q: rotation,
      inverse: new THREE.Matrix4().compose(a, rotation, new THREE.Vector3(1, 1, 1)).invert(),
    };
  });
  function orientation(r, u) {
    up.copy(u).normalize();
    right.copy(r).addScaledVector(up, -r.dot(up)).normalize();
    front.crossVectors(right, up).normalize();
    basis.makeBasis(right, up, front);
    return q.setFromRotationMatrix(basis);
  }
  const r = new THREE.Vector3(),
    u = new THREE.Vector3();
  const shoulderWidth = new THREE.Vector3(...bones[4].from).distanceTo(new THREE.Vector3(...bones[6].from)) * scale;
  const hipWidth = new THREE.Vector3(...bones[8].from).distanceTo(new THREE.Vector3(...bones[11].from)) * scale;
  return {
    mesh,
    meta,
    update(J, V) {
      bones.forEach((bone, i) => {
        const [a, b] = bone.joints;
        direction.copy(J[b]).sub(J[a]);
        const length = direction.length();
        if (length < 0.00001) {
          visibility[i >> 2].setComponent(i % 4, 0);
          return;
        }
        size.set(1, THREE.MathUtils.clamp(length / rests[i].length, 0.5, 2.5), 1);
        if (bone.kind === 'head') {
          orientation(r.copy(J[7]).sub(J[8]), u.copy(J[77]).sub(J[78]));
          size.setScalar(1);
        } else if (bone.kind === 'torso') {
          orientation(r.copy(J[11]).sub(J[12]), direction);
          // Adapt observable skeleton proportions; never map these measurements to sex/gender.
          const width = i === 0 ? J[23].distanceTo(J[24]) / hipWidth : J[11].distanceTo(J[12]) / shoulderWidth;
          size.x = THREE.MathUtils.clamp(width, 0.72, 1.45);
          size.z = Math.sqrt(size.x);
        } else q.setFromUnitVectors(rests[i].direction, direction.normalize()).multiply(rests[i].q);
        matrices[i].compose(J[a], q, size).multiply(rests[i].inverse);
        const c = bone.kind === 'head' ? Math.min(V[0], Math.max(V[7], V[8])) : Math.min(V[a], V[b]);
        visibility[i >> 2].setComponent(i % 4, c);
      });
    },
  };
}

export async function createHumanAvatar(shared, scale, initial = 'neutral') {
  const models = await Promise.all(APPEARANCES.map(n => loadModel(n, shared, scale)));
  const group = new THREE.Group();
  models.forEach(m => group.add(m.mesh));
  let index = Math.max(0, APPEARANCES.indexOf(initial));
  function select(name) {
    const next = APPEARANCES.indexOf(name);
    if (next < 0) return;
    index = next;
    models.forEach((m, i) => (m.mesh.visible = i === index));
  }
  select(initial);
  return {
    mesh: group,
    select,
    get appearance() {
      return APPEARANCES[index];
    },
    get triangles() {
      return models[index].meta.triangles;
    },
    update(J, V) {
      models[index].update(J, V);
    },
  };
}
