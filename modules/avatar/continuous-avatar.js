// Avatar anatómico continuo precalculado (anatomy.bin), animado con cuatro huesos por vértice.
// createContinuousAvatar(uniforms, scale) devuelve la malla lista para la escena.
import * as THREE from 'three';
import { SURFACE_FRAGMENT } from './avatar.js';

// Baked smooth union anatomy, animated by four bone influences per vertex.
export async function createContinuousAvatar(uniforms, scale) {
  const [meshResponse, rigResponse] = await Promise.all([
    fetch('./assets/anatomy.bin'),
    fetch('./assets/anatomy-rig.json'),
  ]);
  if (!meshResponse.ok || !rigResponse.ok) throw new Error('No se pudo cargar la anatomía local.');
  const [buffer, bones] = await Promise.all([meshResponse.arrayBuffer(), rigResponse.json()]);
  const count = new DataView(buffer).getUint32(0, true),
    indexCount = new DataView(buffer).getUint32(4, true);
  if (buffer.byteLength !== 8 + count * 14 * 4 + indexCount * 4 || indexCount % 3)
    throw new Error('Geometría anatómica incompleta.');
  const data = new THREE.InterleavedBuffer(new Float32Array(buffer, 8, count * 14), 14);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, 8 + count * 14 * 4, indexCount), 1));
  for (const [name, size, offset] of [
    ['position', 3, 0],
    ['normal', 3, 3],
    ['skinIndex', 4, 6],
    ['skinWeight', 4, 10],
  ])
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(data, size, offset));
  const matrices = bones.map(() => new THREE.Matrix4());
  const confidence = bones.map(() => 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uBones: { value: matrices }, uBoneVisibility: { value: confidence } },
    vertexShader: /* glsl */ `
      uniform mat4 uBones[${bones.length}];uniform float uBoneVisibility[${bones.length}];uniform float uScale;
      attribute vec4 skinIndex,skinWeight;
      varying vec3 vNormal,vWorld;varying float vVis,vTone;
      void main(){
        mat4 skin=uBones[int(skinIndex.x)]*skinWeight.x+uBones[int(skinIndex.y)]*skinWeight.y+
          uBones[int(skinIndex.z)]*skinWeight.z+uBones[int(skinIndex.w)]*skinWeight.w;
        vec4 p=skin*vec4(position*uScale,1.);
        vWorld=(modelMatrix*p).xyz;
        vNormal=normalize(mat3(modelMatrix)*mat3(skin)*normal);
        vVis=uBoneVisibility[int(skinIndex.x)]*skinWeight.x+uBoneVisibility[int(skinIndex.y)]*skinWeight.y+
          uBoneVisibility[int(skinIndex.z)]*skinWeight.z+uBoneVisibility[int(skinIndex.w)]*skinWeight.w;
        vTone=0.;gl_Position=projectionMatrix*modelViewMatrix*p;
      }
    `,
    fragmentShader: SURFACE_FRAGMENT,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  const yAxis = new THREE.Vector3(0, 1, 0),
    dir = new THREE.Vector3(),
    size = new THREE.Vector3(1, 1, 1),
    q = new THREE.Quaternion();
  const rotation = new THREE.Matrix4(),
    right = new THREE.Vector3(),
    up = new THREE.Vector3(),
    forward = new THREE.Vector3();
  const rests = bones.map(([, , a, b]) => {
    const start = new THREE.Vector3(...a).multiplyScalar(scale),
      end = new THREE.Vector3(...b).multiplyScalar(scale);
    const delta = end.clone().sub(start),
      quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, delta.clone().normalize());
    return {
      length: delta.length(),
      direction: delta.clone().normalize(),
      quaternion: quaternion.clone(),
      inverse: new THREE.Matrix4().compose(start, quaternion, new THREE.Vector3(1, 1, 1)).invert(),
    };
  });
  return {
    mesh,
    triangles: indexCount / 3,
    update(joints, visibility) {
      right.copy(joints[11]).sub(joints[12]).normalize();
      up.copy(joints[75]).sub(joints[76]).normalize();
      forward.crossVectors(right, up).normalize();
      right.crossVectors(up, forward).normalize();
      rotation.makeBasis(right, up, forward);
      bones.forEach(([a, b], i) => {
        dir.copy(joints[b]).sub(joints[a]);
        if (dir.lengthSq() < 1e-8) {
          confidence[i] = 0;
          return;
        }
        size.set(1, THREE.MathUtils.clamp(dir.length() / rests[i].length, 0.65, 1.5), 1);
        if (i < 2) q.setFromRotationMatrix(rotation);
        else q.setFromUnitVectors(rests[i].direction, dir.normalize()).multiply(rests[i].quaternion);
        matrices[i].compose(joints[a], q, size).multiply(rests[i].inverse);
        confidence[i] = Math.min(visibility[a], visibility[b]);
      });
    },
  };
}
