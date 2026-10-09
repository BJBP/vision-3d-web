// Colecciones locales de este navegador: se guardan en localStorage (sus GLB y vídeos, en el almacén de recursos
// de Configuración) y se suman al catálogo del servidor. localCollections, mergeCatalogs(servidor, local) y
// resolveResources(colecciones, obtener) → { urls, errors }.
import {
  CATALOG_VERSION,
  DEFAULT_LAYOUT_OPTIONS,
  LAYOUTS,
  resolveConnections,
  validateCatalog,
} from './catalog-contract.js';

const STORAGE_KEY = 'vision3d.collections.local.v1';
const MAX_BYTES = 512 * 1024;

const empty = () => ({ version: CATALOG_VERSION, collections: [] });

// Lo guardado puede venir de una versión anterior o de una copia: completa lo que falte para poder editarlo.
const normalize = collection => ({
  ...collection,
  name: collection.name || collection.slug,
  layout: LAYOUTS.includes(collection.layout) ? collection.layout : 'ribbon',
  layoutOptions: { ...DEFAULT_LAYOUT_OPTIONS, ...collection.layoutOptions },
  items: Array.isArray(collection.items) ? collection.items.filter(item => item && typeof item === 'object') : [],
});

export function createLocalCollections(storage = globalThis.localStorage) {
  return {
    read() {
      try {
        const data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
        if (!data || !Array.isArray(data.collections)) return empty();
        const collections = data.collections.filter(c => c && typeof c.slug === 'string').map(normalize);
        return { version: CATALOG_VERSION, collections };
      } catch (error) {
        console.warn('Las colecciones locales están dañadas; se ignoran:', error);
        return empty();
      }
    },
    // Guarda solo lo que pasa el contrato; devuelve los avisos para mostrarlos.
    save(data, { knownModels = [], knownSlugs = [] } = {}) {
      const { collections, errors } = validateCatalog(data, { knownModels, knownSlugs, keepEmpty: true });
      const text = JSON.stringify({ version: CATALOG_VERSION, collections });
      if (text.length > MAX_BYTES) throw new Error('Las colecciones locales superan 512 KiB; borra alguna.');
      try {
        storage.setItem(STORAGE_KEY, text);
      } catch (error) {
        throw new Error(`No se pudieron guardar las colecciones en este navegador: ${error.message || error}`);
      }
      return errors;
    },
  };
}

// Las locales van primero y sustituyen a las del servidor con el mismo slug; si alguna marca «start», manda.
export function mergeCatalogs(server, local) {
  const own = (local?.collections ?? []).map(collection => ({ ...collection, status: 'published' }));
  if (!own.length) return server;
  const slugs = new Set(own.map(collection => collection.slug));
  const ownStart = own.some(collection => collection.start === true);
  const rest = (server?.collections ?? [])
    .filter(collection => !slugs.has(collection?.slug))
    .map(collection => (ownStart ? { ...collection, start: false } : collection));
  return { version: CATALOG_VERSION, collections: [...own, ...rest] };
}

// Convierte cada «resource» en un enlace blob: al archivo guardado. Quita los elementos cuyo archivo ya no está y
// las colecciones que se quedan vacías. Las URL devueltas se liberan con URL.revokeObjectURL al recargar.
// Lee un archivo del almacén local; null (con aviso) si falta o no es del tipo esperado.
async function localFile(id, type, getResource, warn) {
  try {
    const entry = await getResource(id);
    if (entry && entry.type === type && entry.blob instanceof Blob) return entry.blob;
  } catch (error) {
    warn(`no se pudo leer (${error.message || error})`);
    return null;
  }
  warn('ya no está en este navegador');
  return null;
}

export async function resolveResources(collections, getResource, createUrl = blob => URL.createObjectURL(blob)) {
  const urls = [];
  const errors = [];
  const open = blob => {
    const url = createUrl(blob);
    urls.push(url);
    return url;
  };
  for (const collection of collections) {
    const kept = [];
    for (const original of collection.items) {
      const item = { ...original };
      const where = `Colección «${collection.slug}»: el archivo`;
      if (item.resource) {
        const blob = await localFile(item.resource, item.type, getResource, why =>
          errors.push(`${where} de «${item.name}» ${why}.`),
        );
        if (!blob) continue;
        item.src = open(blob);
      }
      // Sin su sonido, el elemento se muestra igual.
      if (item.soundResource) {
        const blob = await localFile(item.soundResource, 'audio', getResource, why =>
          errors.push(`${where} de sonido de «${item.name}» ${why}.`),
        );
        if (blob) item.sound = open(blob);
      }
      kept.push(item);
    }
    collection.items = kept;
  }
  return { collections: resolveConnections(collections, errors), urls, errors };
}
