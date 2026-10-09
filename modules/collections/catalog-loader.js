// Carga del catálogo de colecciones: lee el panel (API) o, si no responde o está vacío, el JSON; le suma las colecciones
// locales del navegador, lo valida y elige la colección de inicio.
// loadCatalog({ api, url, local, getResource, knownModels, fallback }) → { collections, start, errors, source, urls }.
import { validateCatalog } from './catalog-contract.js';
import { fetchApiCatalog } from './catalog-api.js';
import { mergeCatalogs, resolveResources } from './local-collections.js';

const MAX_BYTES = 2 * 1024 * 1024;

async function fetchJson(url, fetcher) {
  const response = await fetcher(url, { cache: 'no-cache', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`El catálogo respondió ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error('El catálogo supera 2 MiB.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('El catálogo no es un JSON válido.');
  }
}

// Only published collections are shown, unless a preview asks for drafts.
export function publishedCollections(collections, { drafts = false } = {}) {
  return collections.filter(collection => drafts || collection.status === 'published');
}

export function pickStart(collections, requested) {
  return (
    collections.find(collection => collection.slug === requested) ??
    collections.find(collection => collection.start) ??
    collections[0] ??
    null
  );
}

// The panel is optional (GitHub Pages and the demo server have none): failing to reach it is a note, not an error.
async function readApi(api, fetcher) {
  if (!api) return { data: null, note: null };
  try {
    const data = await fetchApiCatalog({ ...api, fetcher });
    return data.collections.length ? { data, note: null } : { data: null, note: 'El panel no tiene colecciones.' };
  } catch (error) {
    return { data: null, note: error.message || String(error) };
  }
}

export async function loadCatalog({
  api = null,
  url = './collections/catalog.json',
  local = null,
  getResource = null,
  knownModels = [],
  fallback,
  requested = null,
  drafts = false,
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  const errors = [];
  let collections = [];
  const panel = await readApi(api, fetcher);
  let source = panel.data ? 'api' : url;
  let server = panel.data;
  if (!server)
    try {
      server = await fetchJson(url, fetcher);
    } catch (error) {
      errors.push(error.message || String(error));
    }
  if (local?.collections?.length) source = `local+${server ? source : 'none'}`;
  const result = validateCatalog(mergeCatalogs(server ?? { collections: [] }, local), { knownModels });
  if (server || local?.collections?.length) errors.push(...result.errors);
  collections = publishedCollections(result.collections, { drafts });
  let urls = [];
  if (getResource) {
    const resolved = await resolveResources(collections, getResource);
    ({ collections, urls } = resolved);
    errors.push(...resolved.errors);
  }
  if (!collections.length) {
    source = 'fallback';
    collections = publishedCollections(validateCatalog(fallback, { knownModels }).collections);
  }
  const start = pickStart(collections, requested);
  if (requested && start?.slug !== requested)
    errors.push(`No existe la colección publicada «${requested}»; se muestra «${start?.name ?? '—'}».`);
  return { collections, start, errors, source, apiNote: panel.note, urls };
}

export function catalogMessage(errors) {
  if (!errors.length) return '';
  const rest = errors.length - 1;
  const more = rest ? ` (y ${rest} ${rest === 1 ? 'aviso' : 'avisos'} más; detalle en la consola)` : '';
  return `Catálogo de colecciones: ${errors[0]}${more}`;
}
