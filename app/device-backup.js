// Copia completa de este dispositivo en un .zip: escena y perfiles, colecciones locales y archivos de Recursos.
// exportDevice(fuentes) → Blob; importDevice(archivo, fuentes) → { resources, collections }; describeDevice y
// applyDescription los comparte la sincronización con cuenta (account-sync.js).
import { createZip, readZip } from './zip-store.js';

const FORMAT = 'vision3d-device';
const VERSION = 1;
const MANIFEST = 'vision3d.json';
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

const fileName = id => `files/${id}`;

// Lo que describe este dispositivo (sin los archivos): base de la copia .zip y de la sincronización con cuenta.
export async function describeDevice({ settings, collections, resources }) {
  const entries = await resources.list();
  return {
    format: FORMAT,
    version: VERSION,
    settings: settings.backup(),
    collections: collections.read(),
    resources: entries.map(({ id, type, name }) => ({ id, type, name })),
  };
}

export function checkDescription(manifest) {
  if (manifest?.format !== FORMAT || manifest.version !== VERSION)
    throw new Error('Copia de una versión desconocida de Visión 3D.');
  if (!Array.isArray(manifest.resources)) throw new Error('La copia no tiene la lista de archivos.');
  return manifest;
}

// Orden: archivos, colecciones y por último la escena, que puede nombrar un archivo recién repuesto.
// `fileFor(recurso)` → Blob, o null si ya está en este navegador y no hace falta.
export async function applyDescription(manifest, fileFor, sources) {
  const { settings, collections, resources, knownModels = [], knownSlugs = [] } = sources;
  for (const resource of manifest.resources) {
    const blob = await fileFor(resource);
    if (blob) await resources.restore({ ...resource, blob });
  }
  if (manifest.collections) collections.save(manifest.collections, { knownModels, knownSlugs });
  if (manifest.settings) settings.restore(manifest.settings);
  return { resources: manifest.resources.length, collections: manifest.collections?.collections?.length ?? 0 };
}

export async function exportDevice(sources) {
  const entries = await sources.resources.list();
  const manifest = { ...(await describeDevice(sources)), created: new Date().toISOString() };
  for (const resource of manifest.resources) resource.file = fileName(resource.id);
  return createZip([
    { name: MANIFEST, data: JSON.stringify(manifest, null, 2) },
    ...entries.map(entry => ({ name: fileName(entry.id), data: entry.blob })),
  ]);
}

async function readManifest(files) {
  const blob = files.get(MANIFEST);
  if (!blob) throw new Error('No es una copia de Visión 3D (falta vision3d.json).');
  if (blob.size > MAX_MANIFEST_BYTES) throw new Error('La descripción de la copia es demasiado grande.');
  let manifest;
  try {
    manifest = JSON.parse(await blob.text());
  } catch {
    throw new Error('La descripción de la copia no es un JSON válido.');
  }
  return checkDescription(manifest);
}

export async function importDevice(file, sources) {
  const files = await readZip(file);
  const manifest = await readManifest(files);
  // Antes de tocar nada: todos los archivos deben estar en la copia.
  for (const resource of manifest.resources)
    if (!files.get(fileName(resource?.id))) throw new Error(`Falta el archivo de «${resource?.name}» en la copia.`);
  return applyDescription(manifest, async resource => files.get(fileName(resource.id)), sources);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountDeviceBackup(root, sources, { onImported = () => {} } = {}) {
  const status = Object.assign(document.createElement('p'), { className: 'settings-help', role: 'status' });
  const exportButton = Object.assign(document.createElement('button'), {
    type: 'button',
    textContent: 'Exportar todo (.zip)',
  });
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.zip,application/zip' });
  const importLabel = Object.assign(document.createElement('label'), { className: 'settings-import' });
  importLabel.append('Importar todo', input);
  exportButton.onclick = async () => {
    try {
      status.textContent = 'Preparando la copia…';
      download(await exportDevice(sources), `vision3d-copia-${new Date().toISOString().slice(0, 10)}.zip`);
      status.textContent = 'Copia descargada: escena, perfiles, colecciones locales y archivos de Recursos.';
    } catch (error) {
      status.textContent = `No se pudo exportar. ${error.message || error}`;
    }
  };
  input.onchange = async () => {
    const file = input.files[0];
    input.value = '';
    if (!file || !confirm('La copia sustituirá la escena, los perfiles y las colecciones locales. ¿Continuar?')) return;
    try {
      status.textContent = 'Importando…';
      const result = await importDevice(file, sources);
      status.textContent = `Importado: ${result.collections} colecciones y ${result.resources} archivos.`;
      onImported(result);
    } catch (error) {
      status.textContent = `No se importó la copia. ${error.message || error}`;
    }
  };
  const title = Object.assign(document.createElement('h3'), { textContent: 'Copia completa de este dispositivo' });
  const actions = Object.assign(document.createElement('div'), { className: 'settings-actions' });
  actions.append(exportButton, importLabel);
  root.append(title, actions, status);
}
