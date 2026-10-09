// Contrato del catálogo de colecciones (docs/contracts.md §5). validateCatalog(datos, opciones)
// devuelve { collections, errors }: solo colecciones y elementos válidos, con los fallos en español.
export const ITEM_TYPES = ['model', 'video', 'avatar', 'collection'];
export const LAYOUTS = ['ribbon', 'carousel', 'grid'];
export const STATUSES = ['draft', 'published'];
export const CATALOG_VERSION = 1;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const MAX_COLLECTIONS = 200;
const MAX_ITEMS = 60;
const MAX_NAME = 60;
const MODEL_FILE = /\.(glb|gltf)$/i;
const VIDEO_FILE = /\.(mp4|webm)$/i;
const AUDIO_FILE = /\.(mp3|ogg|oga|wav|m4a)$/i;
// Id de un archivo del almacén local del navegador (settings/resources.js); solo lo resuelve resolveResources.
const RESOURCE_ID = /^[A-Za-z0-9-]{1,64}$/;
export const DEFAULT_LAYOUT_OPTIONS = Object.freeze({ visible: 5, labels: true, more: true, rotationSeconds: 0 });

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanName = value => (typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '');

// Relative paths under the site, or https URLs from the API. No other schemes, no "..".
export function safeMediaPath(value, pattern) {
  if (typeof value !== 'string' || value.length > 500) return null;
  const path = value.trim();
  if (!pattern.test(path.split(/[?#]/)[0])) return null;
  if (/^https:\/\/[^/\s]+\/\S*$/i.test(path)) return path;
  if (/^[a-z][a-z0-9+.-]*:|^\/\/|\\/i.test(path) || path.split('/').includes('..')) return null;
  return path;
}

function layoutOptions(value) {
  const source = isObject(value) ? value : {};
  const visible = Number(source.visible);
  const rotation = Number(source.rotationSeconds);
  return {
    visible: Number.isInteger(visible) && visible >= 3 && visible <= 12 ? visible : DEFAULT_LAYOUT_OPTIONS.visible,
    labels: typeof source.labels === 'boolean' ? source.labels : DEFAULT_LAYOUT_OPTIONS.labels,
    more: typeof source.more === 'boolean' ? source.more : DEFAULT_LAYOUT_OPTIONS.more,
    rotationSeconds: Number.isFinite(rotation) && rotation >= 0 && rotation <= 120 ? rotation : 0,
  };
}

function validateItem(raw, { where, knownModels }) {
  if (!isObject(raw)) return { error: `${where}: no es un objeto.` };
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!SLUG.test(id)) return { error: `${where}: «id» debe ser minúsculas, números y guiones.` };
  const label = `${where} «${id}»`;
  if (!ITEM_TYPES.includes(raw.type)) return { error: `${label}: tipo desconocido; usa ${ITEM_TYPES.join(', ')}.` };
  const item = { id, type: raw.type, name: cleanName(raw.name) || id };
  if (typeof raw.icon === 'string' && SLUG.test(raw.icon)) item.icon = raw.icon;
  if (raw.type === 'model') {
    if (typeof raw.model === 'string' && knownModels.includes(raw.model)) item.model = raw.model;
    else if (typeof raw.resource === 'string' && RESOURCE_ID.test(raw.resource)) item.resource = raw.resource;
    else if (raw.src !== undefined) {
      item.src = safeMediaPath(raw.src, MODEL_FILE);
      if (!item.src) return { error: `${label}: «src» debe ser una ruta relativa o https a un .glb o .gltf.` };
    } else return { error: `${label}: indica «model» (${knownModels.join(', ')}) o «src» con un .glb.` };
  } else if (raw.type === 'video' && typeof raw.resource === 'string' && RESOURCE_ID.test(raw.resource)) {
    item.resource = raw.resource;
  } else if (raw.type === 'video') {
    item.src = safeMediaPath(raw.src, VIDEO_FILE);
    if (!item.src) return { error: `${label}: «src» debe ser una ruta relativa o https a un .mp4 o .webm.` };
  } else if (raw.type === 'collection') {
    if (typeof raw.target !== 'string' || !SLUG.test(raw.target))
      return { error: `${label}: «target» debe ser el slug de otra colección.` };
    item.target = raw.target;
  }
  if (raw.type === 'collection') return { item };
  // Animación del GLB: nombre del clip, o false para ninguna (por defecto, la primera).
  if (raw.type === 'model' && raw.animation === false) item.animation = false;
  else if (raw.type === 'model' && typeof raw.animation === 'string' && raw.animation.trim())
    item.animation = raw.animation.trim().slice(0, MAX_NAME);
  // Sonido al abrir el elemento.
  if (typeof raw.soundResource === 'string' && RESOURCE_ID.test(raw.soundResource))
    item.soundResource = raw.soundResource;
  else if (raw.sound !== undefined) {
    item.sound = safeMediaPath(raw.sound, AUDIO_FILE);
    if (!item.sound) return { error: `${label}: «sound» debe ser una ruta relativa o https a un .mp3, .ogg o .wav.` };
  }
  return { item };
}

function validateCollection(raw, index, options) {
  const where = `Colección ${index + 1}`;
  if (!isObject(raw)) return { errors: [`${where}: no es un objeto.`] };
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  if (!SLUG.test(slug)) return { errors: [`${where}: «slug» debe ser minúsculas, números y guiones.`] };
  const label = `Colección «${slug}»`;
  const errors = [];
  const items = [];
  const ids = new Set();
  const rawItems = Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS) : [];
  if (Array.isArray(raw.items) && raw.items.length > MAX_ITEMS)
    errors.push(`${label}: solo se usan los primeros ${MAX_ITEMS} elementos.`);
  rawItems.forEach((rawItem, itemIndex) => {
    const { item, error } = validateItem(rawItem, { where: `${label}, elemento ${itemIndex + 1}`, ...options });
    if (error) errors.push(error);
    else if (ids.has(item.id)) errors.push(`${label}: el elemento «${item.id}» está repetido.`);
    else {
      ids.add(item.id);
      items.push(item);
    }
  });
  const collection = {
    slug,
    name: cleanName(raw.name) || slug,
    status: STATUSES.includes(raw.status) ? raw.status : 'published',
    start: raw.start === true,
    cover: safeMediaPath(raw.cover, /\.(png|jpe?g|webp|avif)$/i) ?? '',
    layout: LAYOUTS.includes(raw.layout) ? raw.layout : 'ribbon',
    layoutOptions: layoutOptions(raw.layoutOptions),
    items,
  };
  return { collection, errors };
}

// Drops connections to collections that do not exist, and collections that end up empty. `knownSlugs`: other
// catalogs' collections that connections may point to; `keepEmpty`: keep collections still being edited.
export function resolveConnections(collections, errors, { knownSlugs = [], keepEmpty = false } = {}) {
  const slugs = new Set([...collections.map(c => c.slug), ...knownSlugs]);
  for (const collection of collections)
    collection.items = collection.items.filter(item => {
      if (item.type !== 'collection' || (slugs.has(item.target) && item.target !== collection.slug)) return true;
      errors.push(`Colección «${collection.slug}»: la conexión «${item.id}» apunta a «${item.target}», que no existe.`);
      return false;
    });
  return collections.filter(collection => {
    if (collection.items.length || keepEmpty) return true;
    errors.push(`Colección «${collection.slug}»: no tiene elementos válidos y no se muestra.`);
    return false;
  });
}

export function validateCatalog(data, { knownModels = [], knownSlugs, keepEmpty } = {}) {
  if (!isObject(data) || !Array.isArray(data.collections))
    return { collections: [], errors: ['El catálogo debe ser un objeto con la lista «collections».'] };
  const errors = [];
  if (data.version !== undefined && data.version !== CATALOG_VERSION)
    errors.push(`Versión de catálogo ${data.version} desconocida; se esperaba ${CATALOG_VERSION}.`);
  const collections = [];
  const slugs = new Set();
  data.collections.slice(0, MAX_COLLECTIONS).forEach((raw, index) => {
    const result = validateCollection(raw, index, { knownModels });
    errors.push(...result.errors);
    if (!result.collection) return;
    if (slugs.has(result.collection.slug)) errors.push(`Colección «${result.collection.slug}» repetida.`);
    else {
      slugs.add(result.collection.slug);
      collections.push(result.collection);
    }
  });
  return { collections: resolveConnections(collections, errors, { knownSlugs, keepEmpty }), errors };
}
