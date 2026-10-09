// Avatares GLB propios: valida el archivo (validateGLB), asocia sus huesos a los roles
// del cuerpo (mapModelRig) y los anima con la pose capturada (createCustomModel).
import * as THREE from 'three';

export const MODEL_ROLES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
];
const aliases = {
  hips: ['hips', 'pelvis'],
  spine: ['spine', 'spine1'],
  chest: ['spine2', 'chest'],
  neck: ['neck'],
  head: ['head'],
  leftUpperArm: ['leftarm', 'leftupperarm'],
  leftLowerArm: ['leftforearm', 'leftlowerarm'],
  leftHand: ['lefthand'],
  rightUpperArm: ['rightarm', 'rightupperarm'],
  rightLowerArm: ['rightforearm', 'rightlowerarm'],
  rightHand: ['righthand'],
  leftUpperLeg: ['leftupleg', 'leftupperleg', 'leftthigh'],
  leftLowerLeg: ['leftleg', 'leftlowerleg', 'leftcalf'],
  leftFoot: ['leftfoot'],
  rightUpperLeg: ['rightupleg', 'rightupperleg', 'rightthigh'],
  rightLowerLeg: ['rightleg', 'rightlowerleg', 'rightcalf'],
  rightFoot: ['rightfoot'],
};
const normalizeName = name =>
  name
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, '')
    .replace(/[^a-z0-9]/g, '');
const REQUIRED_ROLES = [
  'hips',
  'spine',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'rightUpperArm',
  'rightLowerArm',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
];
const segments = {
  spine: [76, 75],
  chest: [79, 75],
  neck: [75, 78],
  head: [78, 77],
  leftUpperArm: [11, 13],
  leftLowerArm: [13, 15],
  leftHand: [15, 19],
  rightUpperArm: [12, 14],
  rightLowerArm: [14, 16],
  rightHand: [16, 20],
  leftUpperLeg: [23, 25],
  leftLowerLeg: [25, 27],
  leftFoot: [27, 31],
  rightUpperLeg: [24, 26],
  rightLowerLeg: [26, 28],
  rightFoot: [28, 32],
};
const nextRole = {
  hips: 'spine',
  spine: 'chest',
  chest: 'neck',
  neck: 'head',
  leftUpperArm: 'leftLowerArm',
  leftLowerArm: 'leftHand',
  rightUpperArm: 'rightLowerArm',
  rightLowerArm: 'rightHand',
  leftUpperLeg: 'leftLowerLeg',
  leftLowerLeg: 'leftFoot',
  rightUpperLeg: 'rightLowerLeg',
  rightLowerLeg: 'rightFoot',
};

export function validateGLB(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20 || buffer.byteLength > 50 * 1024 * 1024)
    throw new Error('El GLB debe medir entre 20 bytes y 50 MiB.');
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error('Archivo GLB 2.0 inválido.');
  let offset = 12,
    json,
    binary = 0;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('GLB truncado.');
    const length = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) throw new Error('Bloque GLB inválido.');
    if (offset === 12 && type !== 0x4e4f534a) throw new Error('Falta la descripción JSON del GLB.');
    if (type === 0x4e4f534a) {
      if (json) throw new Error('GLB con JSON duplicado.');
      try {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)));
      } catch {
        throw new Error('Descripción GLB inválida.');
      }
    } else if (type === 0x004e4942) {
      if (binary) throw new Error('GLB con binario duplicado.');
      binary = length;
    }
    offset += 8 + length;
  }
  if (json?.asset?.version !== '2.0') throw new Error('Se requiere glTF 2.0.');
  for (const item of [...(json.buffers || []), ...(json.images || [])]) {
    if (
      item.uri !== undefined &&
      !/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream);base64,[a-zA-Z0-9+/=]+$/.test(item.uri)
    )
      throw new Error('El GLB debe incluir sus texturas y datos; no se permiten URLs externas.');
  }
  const unsupported = [
    'KHR_draco_mesh_compression',
    'KHR_texture_basisu',
    'EXT_meshopt_compression',
    'KHR_meshopt_compression',
  ];
  if ([...(json.extensionsRequired || []), ...(json.extensionsUsed || [])].some(e => unsupported.includes(e)))
    throw new Error('Exporta el GLB sin compresión Draco, KTX o Meshopt.');
  for (const item of json.buffers || [])
    if (!item.uri && (!Number.isInteger(item.byteLength) || item.byteLength < 0 || item.byteLength > binary))
      throw new Error('El binario GLB no contiene los datos declarados.');
  return json;
}

export function mapModelRig(bones, manual = {}) {
  const mapping = {},
    byName = new Map();
  for (const bone of bones) {
    if (byName.has(bone.name)) byName.set(bone.name, null);
    else byName.set(bone.name, bone);
  }
  for (const role of MODEL_ROLES) {
    if (Object.hasOwn(manual, role)) {
      if (manual[role] && byName.get(manual[role])) mapping[role] = manual[role];
    } else {
      for (const alias of aliases[role]) {
        const candidates = bones.filter(b => normalizeName(b.name) === alias && byName.get(b.name));
        if (candidates.length === 1) {
          mapping[role] = candidates[0].name;
          break;
        }
      }
    }
  }
  const chains = [
    ['hips', 'spine'],
    ['spine', 'head'],
    ['spine', 'leftUpperArm'],
    ['spine', 'rightUpperArm'],
    ['hips', 'leftUpperLeg'],
    ['hips', 'rightUpperLeg'],
    ['leftUpperArm', 'leftLowerArm'],
    ['rightUpperArm', 'rightLowerArm'],
    ['leftUpperLeg', 'leftLowerLeg'],
    ['leftLowerLeg', 'leftFoot'],
    ['rightUpperLeg', 'rightLowerLeg'],
    ['rightLowerLeg', 'rightFoot'],
  ];
  const descendant = (parent, child) => {
    for (let p = child?.parent; p; p = p.parent) if (p === parent) return true;
    return false;
  };
  const compatible =
    REQUIRED_ROLES.every(r => mapping[r]) &&
    new Set(Object.values(mapping)).size === Object.values(mapping).length &&
    chains.every(([a, b]) => descendant(byName.get(mapping[a]), byName.get(mapping[b])));
  return { mapping, compatible };
}

export function validRigAxes(rig, across, vertical) {
  const valid = vector => vector?.isVector3 && vector.toArray().every(Number.isFinite) && vector.lengthSq() > 1e-10;
  if (
    !valid(across) ||
    !valid(vertical) ||
    Math.abs(across.dot(vertical) / Math.sqrt(across.lengthSq() * vertical.lengthSq())) > 0.99
  )
    return false;
  return REQUIRED_ROLES.every(role =>
    rig.some(
      entry =>
        entry.role === role &&
        valid(entry.axis) &&
        entry.worldQ.toArray().every(Number.isFinite) &&
        Math.abs(entry.worldQ.lengthSq() - 1) < 0.01,
    ),
  );
}

function releaseModel(gltf) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    skeletons = new Set(),
    images = new Set();
  for (const scene of gltf.scenes || [gltf.scene])
    scene.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.skeleton) skeletons.add(o.skeleton);
      for (const material of Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])
        materials.add(material);
    });
  for (const material of materials)
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  for (const texture of textures) {
    const data = texture.source?.data;
    for (const image of Array.isArray(data) ? data : [data]) if (image?.close) images.add(image);
    texture.dispose();
  }
  for (const image of images) image.close();
  for (const value of [...geometries, ...materials, ...skeletons]) value.dispose();
}

export async function createCustomModel({ renderer, onInfo = () => {}, onError = () => {} } = {}) {
  const mesh = new THREE.Group(),
    holder = new THREE.Group();
  mesh.add(holder);
  mesh.add(new THREE.HemisphereLight(0xffffff, 0x344047, 2));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(-3, 5, 5);
  mesh.add(key);
  const fill = new THREE.DirectionalLight(0xb7d7ff, 1.2);
  fill.position.set(3, 1, -3);
  mesh.add(fill);
  let options = {},
    requestedId = '',
    modelId = '',
    generation = 0,
    disposed = false,
    gltf,
    mixer,
    action,
    clipName = '',
    bones = [],
    mapping = {},
    compatible = false,
    status = 'Sin modelo';
  let rig = [],
    rests = new Map(),
    hipsRest = new THREE.Vector3(),
    modelCenter = new THREE.Vector3(),
    baseScale = 1,
    calibrationAngle = 0,
    lastTorsoAngle = 0,
    triangles = 0,
    pointerYaw = 0,
    pointerPitch = 0,
    zoomFactor = 1;
  const yaw = new THREE.Quaternion(),
    targetQ = new THREE.Quaternion(),
    parentQ = new THREE.Quaternion(),
    deltaQ = new THREE.Quaternion(),
    direction = new THREE.Vector3(),
    position = new THREE.Vector3();
  const torsoRest = new THREE.Quaternion(),
    torsoNow = new THREE.Quaternion(),
    headNow = new THREE.Quaternion(),
    right = new THREE.Vector3(),
    up = new THREE.Vector3(),
    front = new THREE.Vector3(),
    basis = new THREE.Matrix4();
  function basisQuaternion(across, vertical, result) {
    up.copy(vertical).normalize();
    right.copy(across).addScaledVector(up, -across.dot(up)).normalize();
    front.crossVectors(right, up).normalize();
    return result.setFromRotationMatrix(basis.makeBasis(right, up, front));
  }
  const info = () => ({
    animations: gltf?.animations.map((clip, i) => clip.name || `Animación ${i + 1}`) || [],
    bones: bones.map(b => b.name).filter(Boolean),
    mapping: { ...mapping },
    compatible,
    status,
  });
  const emit = () => onInfo(info());
  function resetBones() {
    for (const [bone, rest] of rests) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
      bone.scale.copy(rest.scale);
    }
    gltf?.scene.updateMatrixWorld(true);
  }
  function buildRig() {
    resetBones();
    const result = mapModelRig(bones, options.modelRig || {});
    mapping = result.mapping;
    const used = new Set();
    gltf.scene.traverse(o => {
      if (o.isSkinnedMesh) for (const bone of o.skeleton.bones) used.add(bone);
    });
    compatible = result.compatible && Object.values(mapping).every(name => used.has(bones.find(b => b.name === name)));
    rig = [];
    for (const role of MODEL_ROLES) {
      const bone = bones.find(b => b.name === mapping[role]);
      if (!bone) continue;
      let child = bones.find(b => b.name === mapping[nextRole[role]]);
      if (role === 'spine' && !child)
        child = bones.find(b => b.name === mapping.neck) || bones.find(b => b.name === mapping.head);
      if (role === 'chest' && !child) child = bones.find(b => b.name === mapping.head);
      if (!child) child = bone.children.find(c => c.isBone);
      const origin = bone.getWorldPosition(new THREE.Vector3());
      const axis = child
        ? child.getWorldPosition(new THREE.Vector3()).sub(origin)
        : new THREE.Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
      if (!origin.toArray().every(Number.isFinite) || !axis.toArray().every(Number.isFinite) || axis.lengthSq() < 1e-10)
        continue;
      rig.push({
        role,
        bone,
        axis: axis.normalize(),
        worldQ: bone.getWorldQuaternion(new THREE.Quaternion()),
        depth: (() => {
          let d = 0;
          for (let p = bone.parent; p; p = p.parent) d++;
          return d;
        })(),
      });
      if (role === 'hips') hipsRest.copy(origin);
    }
    rig.sort((a, b) => a.depth - b.depth);
    if (compatible) {
      const point = role => bones.find(b => b.name === mapping[role]).getWorldPosition(new THREE.Vector3()),
        across = point('leftUpperArm').sub(point('rightUpperArm')),
        vertical = point('head').sub(point('hips'));
      compatible = validRigAxes(rig, across, vertical);
      if (compatible) basisQuaternion(across, vertical, torsoRest);
    }
    status = compatible ? 'Humanoide compatible' : 'Modelo de exhibición: el esqueleto necesita asignación compatible';
  }
  function apply() {
    if (!gltf) return;
    const scale = THREE.MathUtils.clamp(Number(options.modelScale) || 1, 0.2, 3);
    const factor = baseScale * scale * (options.modelUse === 'tracking' ? 1 : zoomFactor);
    holder.scale.setScalar(factor);
    holder.position.copy(modelCenter).multiplyScalar(-factor);
    mesh.rotation.set(
      options.modelUse === 'tracking' ? 0 : pointerPitch,
      THREE.MathUtils.degToRad(Number(options.modelYaw) || 0) +
        (options.modelUse === 'tracking' ? -calibrationAngle : pointerYaw),
      0,
    );
    const requested = options.modelAnimation || '',
      index = gltf.animations.findIndex((clip, i) => (clip.name || `Animación ${i + 1}`) === requested);
    if (clipName !== requested) {
      action?.stop();
      action = null;
      clipName = requested;
      if (index >= 0) {
        action = mixer.clipAction(gltf.animations[index]);
        action.play();
      }
    }
    if (action) action.paused = options.modelPlaying === false || options.modelUse === 'tracking';
  }
  async function configure(next, resourceStore) {
    if (disposed) return;
    const oldRig = JSON.stringify(options.modelRig || {}),
      oldUse = options.modelUse;
    options = { ...next };
    const id = options.modelId || '';
    if (id === requestedId) {
      if (gltf && (oldRig !== JSON.stringify(options.modelRig || {}) || oldUse !== options.modelUse)) {
        mixer.stopAllAction();
        action = null;
        clipName = '';
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        holder.scale.setScalar(baseScale);
        holder.position.copy(modelCenter).multiplyScalar(-baseScale);
        mesh.updateMatrixWorld(true);
        buildRig();
      }
      apply();
      if (oldRig !== JSON.stringify(options.modelRig || {})) emit();
      return;
    }
    requestedId = id;
    const token = ++generation;
    if (!id) {
      mixer?.stopAllAction();
      if (gltf) {
        mixer?.uncacheRoot(gltf.scene);
        holder.remove(gltf.scene);
        releaseModel(gltf);
      }
      gltf = null;
      mixer = null;
      action = null;
      bones = [];
      rests.clear();
      rig = [];
      compatible = false;
      mapping = {};
      modelId = '';
      triangles = 0;
      status = 'Sin modelo';
      emit();
      return;
    }
    status = 'Cargando modelo local';
    emit();
    let loaded;
    try {
      const resource = await resourceStore.get(id);
      if (disposed || token !== generation) return;
      if (!resource || resource.type !== 'model' || !(resource.blob instanceof Blob))
        throw new Error('No se encontró el modelo local.');
      if (resource.blob.size > 50 * 1024 * 1024) throw new Error('El GLB supera 50 MiB.');
      const buffer = await resource.blob.arrayBuffer();
      if (disposed || token !== generation) return;
      validateGLB(buffer);
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      if (disposed || token !== generation) return;
      // Validation disallows remote references before the loader can fetch them.
      loaded = await new GLTFLoader().parseAsync(buffer, '');
      if (disposed || token !== generation) {
        releaseModel(loaded);
        return;
      }
      loaded.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(loaded.scene),
        size = box.getSize(new THREE.Vector3());
      if (box.isEmpty() || ![size.x, size.y, size.z].every(Number.isFinite) || size.y < 1e-6)
        throw new Error('El modelo no tiene una geometría visible válida.');
      mixer?.stopAllAction();
      if (gltf) {
        mixer?.uncacheRoot(gltf.scene);
        holder.remove(gltf.scene);
        releaseModel(gltf);
      }
      gltf = loaded;
      loaded = null;
      modelId = id;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      modelCenter.copy(box.getCenter(new THREE.Vector3()));
      holder.position.set(0, 0, 0);
      holder.scale.setScalar(1);
      holder.add(gltf.scene);
      const names = new Set();
      gltf.animations.forEach((clip, i) => {
        const name = clip.name || `Animación ${i + 1}`;
        clip.name = names.has(name) ? `${name} (${i + 1})` : name;
        names.add(clip.name);
      });
      baseScale = 4.6 / size.y;
      bones = [];
      rests = new Map();
      triangles = 0;
      gltf.scene.traverse(bone => {
        if (bone.isBone) {
          bones.push(bone);
          rests.set(bone, {
            position: bone.position.clone(),
            quaternion: bone.quaternion.clone(),
            scale: bone.scale.clone(),
          });
        }
        if (bone.isMesh) {
          bone.frustumCulled = false;
          triangles +=
            ((bone.geometry.index?.count || bone.geometry.attributes.position?.count || 0) / 3) *
            (bone.isInstancedMesh ? bone.count : 1);
        }
      });
      holder.scale.setScalar(baseScale);
      holder.position.copy(modelCenter).multiplyScalar(-baseScale);
      mesh.updateMatrixWorld(true);
      buildRig();
      mixer = new THREE.AnimationMixer(gltf.scene);
      action = null;
      clipName = '';
      calibrationAngle = 0;
      apply();
      emit();
    } catch (error) {
      if (loaded) releaseModel(loaded);
      if (disposed || token !== generation) return;
      requestedId = modelId;
      status = gltf ? 'Se conserva el modelo anterior' : 'No se pudo cargar el modelo';
      emit();
      onError(error);
    }
  }
  function update(J, V, dt, { trackingActive = false, reducedMotion = false } = {}) {
    if (!gltf) return;
    apply();
    if (options.modelUse !== 'tracking') {
      mesh.position.set(0, 0, 0);
      if (action && options.modelPlaying !== false && !reducedMotion) mixer.update(Math.min(0.1, Math.max(0, dt)));
      return;
    }
    if (!compatible || !trackingActive || ![11, 12, 23, 24].every(i => V[i] > 0.55)) return;
    const across = direction.copy(J[11]).sub(J[12]);
    lastTorsoAngle = Math.atan2(-across.z, across.x);
    basisQuaternion(across, new THREE.Vector3().copy(J[75]).sub(J[76]), torsoNow);
    yaw.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(Number(options.modelYaw) || 0) - calibrationAngle,
    );
    const k = 1 - Math.exp(-Math.max(0, Math.min(0.1, dt)) * 12);
    // Preserve authored translations/scales and solve rotations in each parent frame.
    position
      .copy(hipsRest)
      .multiplyScalar(THREE.MathUtils.clamp(Number(options.modelScale) || 1, 0.2, 3))
      .applyQuaternion(yaw);
    mesh.position.lerp(J[76].clone().sub(position), k);
    mesh.updateMatrixWorld(true);
    for (const entry of rig) {
      let a, b;
      if (entry.role === 'hips') {
        a = 76;
        b = 75;
      } else [a, b] = segments[entry.role] || [];
      if (a === undefined || !J[a] || !J[b] || Math.min(V[a] ?? 0, V[b] ?? 0) < 0.55) continue;
      direction.copy(J[b]).sub(J[a]);
      if (direction.lengthSq() < 1e-10) continue;
      direction.normalize().applyQuaternion(yaw);
      if (['hips', 'spine', 'chest'].includes(entry.role))
        targetQ.copy(yaw).multiply(torsoNow).multiply(torsoRest.clone().invert()).multiply(entry.worldQ);
      else if (entry.role === 'head' && V[7] > 0.55 && V[8] > 0.55 && J[7].distanceToSquared(J[8]) > 1e-10) {
        basisQuaternion(new THREE.Vector3().copy(J[7]).sub(J[8]), new THREE.Vector3().copy(J[b]).sub(J[a]), headNow);
        targetQ.copy(yaw).multiply(headNow).multiply(torsoRest.clone().invert()).multiply(entry.worldQ);
      } else {
        deltaQ.setFromUnitVectors(entry.axis, direction);
        targetQ.copy(deltaQ).multiply(entry.worldQ);
      }
      entry.bone.parent.getWorldQuaternion(parentQ);
      targetQ.premultiply(parentQ.invert());
      entry.bone.quaternion.slerp(targetQ, k);
      entry.bone.updateMatrixWorld(true);
    }
  }
  return {
    mesh,
    configure,
    update,
    calibrate() {
      calibrationAngle = lastTorsoAngle;
    },
    rotate(dx, dy) {
      if (options.modelUse !== 'tracking') {
        pointerYaw += Number(dx) || 0;
        pointerPitch = THREE.MathUtils.clamp(pointerPitch + (Number(dy) || 0), -1.2, 1.2);
        apply();
      }
    },
    zoom(factor) {
      if (options.modelUse !== 'tracking' && Number.isFinite(factor) && factor > 0) {
        zoomFactor = THREE.MathUtils.clamp(zoomFactor * factor, 0.25, 4);
        apply();
      }
    },
    state: () => ({
      ...info(),
      modelId,
      id: modelId,
      loaded: !!gltf,
      triangles,
      loading: status === 'Cargando modelo local',
    }),
    dispose() {
      disposed = true;
      generation++;
      mixer?.stopAllAction();
      if (gltf) {
        mixer?.uncacheRoot(gltf.scene);
        releaseModel(gltf);
      }
      mesh.clear();
      gltf = null;
      mixer = null;
      action = null;
      bones = [];
      rests.clear();
      rig = [];
      modelId = '';
      requestedId = '';
      triangles = 0;
      compatible = false;
      mapping = {};
      status = 'Sin modelo';
    },
  };
}
