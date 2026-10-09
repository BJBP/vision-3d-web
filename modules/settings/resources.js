// Almacén local (IndexedDB) de vídeos de fondo y modelos GLB subidos por el usuario,
// con validación de tipo, tamaño (RESOURCE_LIMITS) y nombre. Nada se envía al servidor.
const DB_NAME = 'vision3d.beta.resources.v1';
export const RESOURCE_LIMITS = Object.freeze({
  video: 200 * 1024 * 1024,
  model: 50 * 1024 * 1024,
  // Sonidos al abrir un elemento de una colección (Configuración → Colecciones).
  audio: 10 * 1024 * 1024,
});
const LIMIT_TEXT = {
  video: 'de vídeo de hasta 200 MiB',
  model: 'GLB de hasta 50 MiB',
  audio: 'de sonido de hasta 10 MiB',
};
export const RESOURCE_LABELS = Object.freeze({ video: 'Vídeo', model: 'Modelo GLB', audio: 'Sonido' });
export function validateResourceFile(file, type) {
  if (
    !(file instanceof Blob) ||
    !Object.hasOwn(RESOURCE_LIMITS, type) ||
    !file.size ||
    file.size > RESOURCE_LIMITS[type]
  )
    throw Error(`El recurso debe ser un archivo ${LIMIT_TEXT[type] ?? LIMIT_TEXT.model}.`);
  if (
    typeof file.name !== 'string' ||
    (type === 'model'
      ? !/\.glb$/i.test(file.name) ||
        (!!file.type && !['model/gltf-binary', 'application/octet-stream'].includes(file.type))
      : type === 'audio'
        ? !(/\.(mp3|ogg|oga|wav|m4a)$/i.test(file.name) && (!file.type || file.type.startsWith('audio/')))
        : !(/\.(mp4|webm)$/i.test(file.name) && (!file.type || file.type.startsWith('video/'))))
  )
    throw Error('Formato no compatible. Usa vídeo MP4/WebM, modelo .glb autocontenido o sonido MP3/OGG/WAV.');
  return file;
}
export function validateResourceName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || /[\u0000-\u001f]/.test(name))
    throw Error('Escribe un nombre de 1 a 120 caracteres.');
  return name.trim();
}
async function transact(mode, operation) {
  if (!globalThis.indexedDB) throw Error('Este navegador no permite guardar recursos locales.');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('resources', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Cierra otras pestañas de la biblioteca y vuelve a intentar.'));
  });
  return new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction('resources', mode),
      store = tx.objectStore('resources');
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || Error('No se pudo guardar el recurso; revisa el espacio disponible.'));
    };
    try {
      operation(store, value => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
    }
  });
}
export const resourceStore = {
  list() {
    return transact('readonly', (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
  },
  get(id) {
    return transact('readonly', (store, done) => {
      const request = store.get(id);
      request.onsuccess = () => done(request.result);
    });
  },
  async add(file, type) {
    validateResourceFile(file, type);
    const entry = { id: crypto.randomUUID(), type, name: validateResourceName(file.name.slice(0, 120)), blob: file };
    return transact('readwrite', (store, done) => {
      store.add(entry);
      done(entry);
    });
  },
  // Repone un recurso de una copia con su mismo id (los perfiles y las colecciones lo nombran por id).
  restore({ id, type, name, blob }) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(id)) throw Error('Identificador de recurso no válido.');
    if (
      !(blob instanceof Blob) ||
      !Object.hasOwn(RESOURCE_LIMITS, type) ||
      !blob.size ||
      blob.size > RESOURCE_LIMITS[type]
    )
      throw Error(`El recurso «${name}» no es un archivo ${LIMIT_TEXT[type] ?? LIMIT_TEXT.model}.`);
    const entry = { id, type, name: validateResourceName(name), blob };
    return transact('readwrite', (store, done) => {
      store.put(entry);
      done(entry);
    });
  },
  rename(id, name) {
    name = validateResourceName(name);
    return transact('readwrite', (store, done) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          store.transaction.abort();
          return;
        }
        const entry = { ...request.result, name };
        store.put(entry);
        done(entry);
      };
    });
  },
  remove(id) {
    return transact('readwrite', (store, done) => {
      store.delete(id);
      done(true);
    });
  },
};
