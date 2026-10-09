// Superficie sólida del avatar (SURFACE_FRAGMENT, createAvatar) deformada por las articulaciones,
// y la plataforma luminosa del escenario (createStage).
import * as THREE from 'three';
import { DEFORM_GLSL, JOINTS } from './body.js';

export const SURFACE_FRAGMENT = /* glsl */ `
      uniform float uStage,uTime,uSurface,uMotion;
      uniform vec3 uMagic;
      varying vec3 vNormal,vWorld; varying float vVis,vTone;
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){
        float reveal=smoothstep(1.40,1.98,uStage)*smoothstep(.24,.68,vVis)*uSurface;
        if(reveal<.001 || hash(floor(gl_FragCoord.xy))>reveal) discard;
        vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);
        float facing=max(0.,dot(n,v)),rim=pow(1.-abs(dot(n,v)),2.8);
        vec3 key=normalize(vec3(-.65,1.1,1.2)),fill=normalize(vec3(.8,.2,.6));
        float diffuse=max(0.,dot(n,key)),bounce=max(0.,dot(n,fill));
        float spec=pow(max(0.,dot(n,normalize(key+v))),52.);
        float soft=pow(max(0.,dot(n,normalize(fill+v))),16.);
        vec3 base=mix(vec3(.032,.065,.067),uMagic*.065,.6);
        vec3 col=base*(.6+1.8*diffuse)+vec3(.40,.45,.42)*diffuse*.26;
        col+=vec3(.95,.88,.72)*spec*.44+uMagic*soft*.16;
        col+=uMagic*rim*.22+vec3(.032,.071,.067)*bounce;
        // Fine etched latitude lines. Low contrast; never flashing over the face.
        float lines=pow(.5+.5*sin(vWorld.y*195.),18.);
        col+=uMagic*lines*.009;
        float sweep=exp(-pow((vWorld.y-(mod(uTime*.32,7.)-3.5))/.075,2.));
        col+=uMagic*sweep*.035*uMotion;
        if(vTone>.5 && vTone<1.5) col=vec3(.028,.045,.045)+vec3(.30,.40,.35)*spec;
        if(vTone>1.5 && vTone<2.5) col=uMagic*.28+vec3(.10,.15,.13)*spec;
        if(vTone>2.5 && vTone<3.5) col=vec3(.72,.88,.81);
        gl_FragColor=vec4(col,1.);
      }
    `;

// Solid depth-writing anatomy gives the silhouette weight; particles become surface accents.
export function createAvatar(data, uniforms, continuous = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.aJ.length), 3));
  for (const [name, size] of [
    ['aJ', 3],
    ['aP', 4],
    ['aR', 2],
    ['aN', 3],
  ]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(data[name], size));
  }
  let indices = data.index;
  if (continuous) {
    const keep = [];
    for (let k = 0; k < data.index.length; k += 3) {
      const v = data.index[k],
        joint = data.aJ[v * 3],
        kind = data.aJ[v * 3 + 2];
      if (kind === 1 || kind === 8 || (kind === 0 && (joint < 33 || joint >= 75))) continue;
      keep.push(data.index[k], data.index[k + 1], data.index[k + 2]);
    }
    indices = new Uint32Array(keep);
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform vec3 uJ[${JOINTS}]; uniform float uV[${JOINTS}];
      uniform float uScale,uHeadR,uEyeOpen;
      attribute vec3 aJ,aN; attribute vec4 aP; attribute vec2 aR;
      varying vec3 vNormal,vWorld; varying float vVis,vTone;
      ${DEFORM_GLSL}
      void main(){
        vec3 p,n;float vis,tone;anatomy(p,n,vis,tone);
        vNormal=normalize(mat3(modelMatrix)*n);vWorld=(modelMatrix*vec4(p,1.)).xyz;
        vVis=vis;vTone=tone;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }
    `,
    fragmentShader: SURFACE_FRAGMENT,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export function createStage(scene, magic) {
  const group = new THREE.Group();
  const rings = [];
  for (const [radius, width, opacity] of [
    [1.45, 0.012, 0.28],
    [1.34, 0.004, 0.12],
    [1.07, 0.005, 0.08],
  ]) {
    const m = new THREE.MeshBasicMaterial({
      color: magic,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - width, radius, 160), m);
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
    rings.push([m, opacity]);
  }
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(1.43, 96),
    new THREE.MeshBasicMaterial({
      color: '#13352f',
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = -0.008;
  group.add(disk);
  scene.add(group);
  return {
    group,
    update(amount) {
      for (const [mat, opacity] of rings) mat.opacity = opacity * amount;
      disk.material.opacity = 0.1 * amount;
      group.visible = amount > 0.01;
    },
  };
}
