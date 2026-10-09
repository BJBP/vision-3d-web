// Operaciones de edición de las colecciones locales sobre el catálogo en formato §5 (sin DOM ni almacenamiento).
// Cada función recibe el catálogo, lo modifica y devuelve lo creado o borrado; el editor guarda después.
import { DEFAULT_LAYOUT_OPTIONS, LAYOUTS } from './catalog-contract.js';

const MAX_SLUG = 40;

// «Ferias 2026» → «ferias-2026», único entre `taken` (añade -2, -3… si hace falta).
export function slugify(name, taken = []) {
  const base =
    String(name)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG - 3)
      .replace(/-+$/, '') || 'elemento';
  const used = new Set(taken);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const find = (data, slug) => {
  const collection = data.collections.find(c => c.slug === slug);
  if (!collection) throw new Error(`No existe la colección «${slug}».`);
  return collection;
};

export function addCollection(data, name, takenElsewhere = []) {
  const clean = String(name).trim().slice(0, 60);
  if (!clean) throw new Error('Escribe un nombre para la colección.');
  const slug = slugify(clean, [...data.collections.map(c => c.slug), ...takenElsewhere]);
  data.collections.push({
    slug,
    name: clean,
    start: !data.collections.length,
    layout: 'ribbon',
    layoutOptions: { ...DEFAULT_LAYOUT_OPTIONS },
    items: [],
  });
  return slug;
}

// Borra la colección y las conexiones que apuntaban a ella; devuelve los archivos que usaba.
export function removeCollection(data, slug) {
  const collection = find(data, slug);
  data.collections = data.collections.filter(c => c !== collection);
  for (const other of data.collections)
    other.items = other.items.filter(item => item.type !== 'collection' || item.target !== slug);
  if (collection.start && data.collections.length) data.collections[0].start = true;
  return collection.items.map(item => item.resource).filter(Boolean);
}

export function updateCollection(data, slug, { name, start, layout, layoutOptions } = {}) {
  const collection = find(data, slug);
  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 60);
    if (!clean) throw new Error('El nombre no puede quedar vacío.');
    collection.name = clean;
  }
  if (start === true) for (const other of data.collections) other.start = other === collection;
  if (start === false) collection.start = false;
  if (LAYOUTS.includes(layout)) collection.layout = layout;
  if (layoutOptions)
    collection.layoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...collection.layoutOptions, ...layoutOptions };
  return collection;
}

// `fields`: { type, name }, uno de model, resource o target y, si se quiere, animation y soundResource.
// El id sale del nombre.
export function addItem(data, slug, fields) {
  const collection = find(data, slug);
  const name = String(fields.name ?? '')
    .trim()
    .slice(0, 60);
  if (!name) throw new Error('Escribe un nombre para el elemento.');
  if (fields.type === 'collection' && fields.target === slug)
    throw new Error('Una colección no puede conectarse consigo misma.');
  const item = {
    id: slugify(
      name,
      collection.items.map(i => i.id),
    ),
    type: fields.type,
    name,
  };
  for (const key of ['model', 'resource', 'target', 'soundResource']) if (fields[key]) item[key] = fields[key];
  if (fields.animation === false || typeof fields.animation === 'string') item.animation = fields.animation;
  collection.items.push(item);
  return item;
}

export function moveItem(data, slug, index, delta) {
  const { items } = find(data, slug);
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return false;
  [items[index], items[to]] = [items[to], items[index]];
  return true;
}

// Devuelve el elemento quitado (su archivo sigue en Recursos, por si se usa en otro sitio).
export function removeItem(data, slug, index) {
  const { items } = find(data, slug);
  return items.splice(index, 1)[0] ?? null;
}
