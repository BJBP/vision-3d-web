// Validación de GLB propios y de su esqueleto, sin three.js: validateGLB lee la descripción del archivo,
// mapModelRig asocia huesos a roles del cuerpo y validRigAxes comprueba los ejes calculados.

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

// Nombres como los deja GLTFLoader (PropertyBinding.sanitizeNodeName), para que el mapeo coincida con la escena.
const sanitizeNodeName = name =>
  String(name ?? '')
    .replace(/\s/g, '_')
    .replace(/[[\].:/]/g, '');

// Jerarquía de nodos del GLB como objetos { name, parent }. Rechaza ciclos para no colgar la búsqueda de ancestros.
function nodeTree(nodes) {
  const objects = nodes.map(node => ({ name: sanitizeNodeName(node?.name), parent: null }));
  nodes.forEach((node, index) => {
    for (const child of Array.isArray(node?.children) ? node.children : [])
      if (objects[child] && !objects[child].parent && child !== index) objects[child].parent = objects[index];
  });
  for (const object of objects) {
    let steps = 0;
    for (let p = object.parent; p; p = p.parent)
      if (++steps > objects.length) throw new Error('El GLB tiene una jerarquía de nodos inválida.');
  }
  return objects;
}

// Analiza un GLB sin cargarlo en la escena: cuántos huesos tiene y si sigue el cuerpo con el mapeo automático.
// La comprobación final (ejes y huesos usados por las mallas) la hace createCustomModel al cargarlo.
export function inspectModelRig(buffer) {
  const json = validateGLB(buffer),
    objects = nodeTree(Array.isArray(json.nodes) ? json.nodes : []);
  const joints = new Set((json.skins || []).flatMap(skin => (Array.isArray(skin?.joints) ? skin.joints : [])));
  const bones = [...joints].map(index => objects[index]).filter(Boolean);
  return {
    bones: bones.length,
    tracking: bones.length > 0 && mapModelRig(bones).compatible,
    animations: Array.isArray(json.animations) ? json.animations.length : 0,
  };
}
