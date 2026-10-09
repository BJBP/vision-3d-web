// Service worker: guarda la web, el catálogo y los modelos ya vistos para que un kiosco siga funcionando si
// cae la red (docs/collections.md). Web y catálogo: primero la red, y la caché si falla o tarda. Modelos,
// imágenes y archivos subidos: primero la caché. No guarda peticiones con sesión (vista previa) ni parciales.
const CACHE_VERSION = 1;
const SHELL_CACHE = `v3d-shell-${CACHE_VERSION}`;
const MEDIA_CACHE = `v3d-media-${CACHE_VERSION}`;
const MEDIA_LIMIT = 80;
const NETWORK_TIMEOUT_MS = 4000;
const OFFLINE_GRACE_MS = 30000;
const MEDIA_PATTERN = /\.(glb|gltf|bin|png|jpe?g|webp|avif|task|wasm)$/i;

// 'network' (red y luego caché), 'media' (caché y luego red) o null (el navegador la atiende sin guardar).
function strategyFor(request, scope) {
  if (request.method !== 'GET' || request.headers.has('Authorization') || request.headers.has('Range')) return null;
  const url = new URL(request.url);
  const base = new URL(scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  const path = url.pathname.slice(base.pathname.length);
  // Archivos privados de la cuenta (sincronización): siempre a la red, nunca a la caché compartida.
  if (path.startsWith('api/files/device_sync/') || url.searchParams.has('token')) return null;
  if (path.startsWith('api/files/')) return 'media';
  if (path.startsWith('api/collections/catalog_')) return 'network';
  if (path.startsWith('api/') || path.startsWith('_/')) return null;
  return MEDIA_PATTERN.test(path) ? 'media' : 'network';
}

// 'opaqueredirect': la raíz "/" redirige a la portada (LANDING_QUERY) y también debe abrir sin red.
const cacheable = response =>
  (response.ok && response.status === 200 && response.type === 'basic') || response.type === 'opaqueredirect';

async function trim(cache, limit) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}

async function store(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (cacheName === MEDIA_CACHE) await trim(cache, MEDIA_LIMIT);
}

// Tras un fallo de red, durante OFFLINE_GRACE_MS se sirve la copia sin esperar (si no, cada archivo de la web
// esperaría NETWORK_TIMEOUT_MS); la red se sigue intentando por detrás y la primera respuesta lo desactiva.
let offlineUntil = 0;

async function networkFirst(request, wait) {
  const network = fetch(request);
  // Fallos esperados sin red: los cubre la copia guardada de más abajo.
  const saved = network.then(
    async response => {
      offlineUntil = 0;
      if (cacheable(response)) await store(SHELL_CACHE, request, response.clone());
    },
    () => (offlineUntil = Date.now() + OFFLINE_GRACE_MS),
  );
  wait(saved);
  const cached = () => caches.match(request, { cacheName: SHELL_CACHE });
  if (Date.now() < offlineUntil) return (await cached()) ?? network;
  let timer;
  const timeout = new Promise(resolve => (timer = setTimeout(resolve, NETWORK_TIMEOUT_MS, null)));
  const first = await Promise.race([network, timeout]).catch(() => null);
  clearTimeout(timer);
  // Un 5xx (p. ej. el panel caído detrás de Caddy) tampoco debe tapar la copia guardada.
  if (first && first.status < 500) return first;
  if (first) return (await cached()) ?? first;
  offlineUntil = Date.now() + OFFLINE_GRACE_MS;
  return (await cached()) ?? network;
}

async function mediaFirst(request, wait) {
  const cached = await caches.match(request, { cacheName: MEDIA_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) wait(store(MEDIA_CACHE, request, response.clone()));
  return response;
}

// Guarda lo que la página cargó antes de que este service worker la controlara (primera visita).
async function remember(urls) {
  for (const url of urls) {
    const request = new Request(url);
    const strategy = strategyFor(request, self.registration.scope);
    if (!strategy) continue;
    const cacheName = strategy === 'media' ? MEDIA_CACHE : SHELL_CACHE;
    if (await caches.match(request, { cacheName })) continue;
    try {
      const response = await fetch(request);
      if (cacheable(response)) await store(cacheName, request, response);
    } catch (error) {
      console.warn('No se pudo guardar para uso sin conexión:', url, error);
    }
  }
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  const current = [SHELL_CACHE, MEDIA_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then(names => Promise.all(names.filter(name => !current.includes(name)).map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const strategy = strategyFor(event.request, self.registration.scope);
  if (!strategy) return;
  const wait = promise => event.waitUntil(promise);
  event.respondWith(strategy === 'media' ? mediaFirst(event.request, wait) : networkFirst(event.request, wait));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'remember' && Array.isArray(event.data.urls))
    event.waitUntil(remember(event.data.urls.filter(url => typeof url === 'string')));
});
