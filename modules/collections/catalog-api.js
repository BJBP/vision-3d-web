// Lectura del catálogo desde la API de PocketBase (panel de administración, docs/collections.md). Traduce los
// registros al contrato del catálogo (§5) para que validateCatalog los trate igual que el JSON.
// fetchApiCatalog({ base, token, fetcher }) → catálogo; recordsToCatalog(colecciones, elementos, base); adminToken().
const PER_PAGE = 500;
const MAX_PAGES = 30;
// Clave donde el panel de PocketBase (servido en /_/) guarda la sesión del administrador.
const ADMIN_SESSION_KEY = '__pb_superusers__/_';

const fileUrl = (base, record, name) =>
  `${base}api/files/${encodeURIComponent(record.collectionId)}/${encodeURIComponent(record.id)}/${encodeURIComponent(name)}`;

function toItem(record, base) {
  const item = { id: record.key, type: record.type, name: record.name || undefined, icon: record.icon || undefined };
  if (record.model) item.model = record.model;
  if (record.file) item.src = fileUrl(base, record, record.file);
  else if (record.url) item.src = record.url;
  // A link to a draft is not expanded for visitors: it is left out instead of reported as broken.
  if (record.type === 'collection') item.target = record.expand?.target?.slug;
  if (record.noAnimation) item.animation = false;
  else if (record.animation) item.animation = record.animation;
  if (record.sound) item.sound = fileUrl(base, record, record.sound);
  return item;
}

export function recordsToCatalog(collectionRecords, itemRecords, base = './') {
  const byId = new Map(
    collectionRecords.map(record => [
      record.id,
      {
        slug: record.slug,
        name: record.name,
        status: record.status,
        start: Boolean(record.start),
        cover: record.cover ? fileUrl(base, record, record.cover) : undefined,
        layout: record.layout || undefined,
        layoutOptions: {
          visible: record.visible || undefined,
          labels: !record.hideLabels,
          more: !record.hideMore,
          rotationSeconds: record.rotationSeconds || 0,
        },
        items: [],
      },
    ]),
  );
  for (const record of itemRecords) {
    const item = toItem(record, base);
    if (item.type === 'collection' && !item.target) continue;
    byId.get(record.collection)?.items.push(item);
  }
  return { version: 1, collections: [...byId.values()] };
}

async function listAll(base, name, query, { token, fetcher }) {
  const records = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${base}api/collections/${name}/records?page=${page}&perPage=${PER_PAGE}&${query}`;
    const response = await fetcher(url, {
      cache: 'no-cache',
      credentials: 'same-origin',
      headers: token ? { Authorization: token } : {},
    });
    if (!response.ok) throw new Error(`El panel de colecciones respondió ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body?.items)) throw new Error('El panel de colecciones devolvió un formato inesperado.');
    records.push(...body.items);
    if (page >= (body.totalPages ?? 1)) break;
  }
  return records;
}

export async function fetchApiCatalog({
  base = './',
  token = null,
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  const options = { token, fetcher };
  const [collections, items] = await Promise.all([
    listAll(base, 'catalog_collections', 'sort=position,created', options),
    listAll(base, 'catalog_items', 'sort=position,created&expand=target', options),
  ]);
  return recordsToCatalog(collections, items, base);
}

// Session token of an administrator logged into the panel in this browser, for previewing drafts.
export function adminToken(storage = globalThis.localStorage) {
  try {
    const token = JSON.parse(storage?.getItem(ADMIN_SESSION_KEY) ?? 'null')?.token;
    return typeof token === 'string' && token ? token : null;
  } catch (error) {
    console.warn('No se pudo leer la sesión del panel de colecciones:', error);
    return null;
  }
}
