// Sincroniza este dispositivo con la cuenta: la misma descripción que la copia completa (device-backup.js) y sus
// archivos. planSync decide qué hacer; pushDevice sube (solo los archivos nuevos) y pullDevice baja lo que falta.
// La sesión y el estado de la última sincronización viven en localStorage (createSyncState).
import { applyDescription, checkDescription, describeDevice } from './device-backup.js';

const STATE_KEY = 'vision3d.account.v1';
const EXTENSIONS = { model: 'glb', video: 'mp4' };

// Huella corta (FNV-1a) para saber si el dispositivo cambió desde la última sincronización.
export function fingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Un dispositivo «vacío» (sin colecciones, archivos ni perfiles) nunca pisa lo que hay en la cuenta.
export const isPristine = device =>
  !device.collections?.collections?.length && !device.resources.length && !device.settings?.profiles?.length;

// 'none', 'push' (subir), 'pull' (bajar) o 'conflict' (cambiaron los dos: elige la persona).
export function planSync({ device, state, remote }) {
  const pristine = isPristine(device);
  if (!remote) return pristine ? 'none' : 'push';
  const localChanged = !pristine && fingerprint(device) !== state.lastHash;
  const remoteChanged = remote.updated !== state.lastRemote;
  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged) return 'push';
  return remoteChanged ? 'pull' : 'none';
}

export function createSyncState(storage = globalThis.localStorage) {
  return {
    read() {
      try {
        return JSON.parse(storage?.getItem(STATE_KEY) ?? 'null') ?? {};
      } catch (error) {
        console.warn('Estado de la cuenta dañado; se inicia sin sesión:', error);
        return {};
      }
    },
    write(state) {
      storage.setItem(STATE_KEY, JSON.stringify(state));
    },
    clear() {
      storage.removeItem(STATE_KEY);
    },
  };
}

// Sube la descripción y los archivos que el servidor aún no tiene; quita del servidor los que ya no existen aquí.
export async function pushDevice({ api, session, sources, remote, onProgress = () => {} }) {
  const device = await describeDevice(sources);
  let record = remote ?? (await api.saveSync(session, null, { ...device, resources: [] }));
  const stored = new Map(
    (record.data?.resources ?? []).filter(r => record.files.includes(r.file)).map(r => [r.id, r.file]),
  );
  const missing = device.resources.filter(resource => !stored.has(resource.id));
  for (const [index, resource] of missing.entries()) {
    onProgress(`Subiendo ${index + 1} de ${missing.length}: ${resource.name}`);
    const entry = await sources.resources.get(resource.id);
    const name = `${resource.id}.${EXTENSIONS[resource.type] ?? 'bin'}`;
    if (!entry) throw new Error(`El archivo «${resource.name}» ya no está en este navegador.`);
    const uploaded = await api.uploadFile(session, record, entry.blob, name);
    record = uploaded.record;
    stored.set(resource.id, uploaded.file);
  }
  const keep = new Set(device.resources.map(resource => stored.get(resource.id)));
  const stale = record.files.filter(file => !keep.has(file));
  if (stale.length) record = await api.removeFiles(session, record, stale);
  const data = { ...device, resources: device.resources.map(r => ({ ...r, file: stored.get(r.id) })) };
  record = await api.saveSync(session, record, data);
  return { record, hash: fingerprint(device) };
}

// Baja la descripción de la cuenta y solo los archivos que este navegador no tiene; después hay que recargar.
export async function pullDevice({ api, session, sources, remote, onProgress = () => {} }) {
  const description = checkDescription(remote.data);
  const total = description.resources.length;
  let index = 0;
  await applyDescription(
    description,
    async resource => {
      index++;
      if (await sources.resources.get(resource.id)) return null;
      onProgress(`Descargando ${index} de ${total}: ${resource.name}`);
      return api.download(session, remote, resource.file);
    },
    sources,
  );
  return { record: remote, hash: fingerprint(await describeDevice(sources)) };
}
