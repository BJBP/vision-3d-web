// Herramientas de administración desde Configuración: colecciones locales (pestaña Colecciones), copia completa
// del dispositivo y, si el sitio la activa, cuenta con sincronización (pestaña Perfiles). installLocalAdmin({ center, catalog, local, resources, defaultCatalog }).
// Un fallo aquí se muestra como aviso y nunca detiene la escena.
import { mountCollectionEditor } from '../modules/collections/index.js';
import { mountDeviceBackup } from './device-backup.js';
import { mountAccountPanel } from './account-panel.js';
import { createAccountApi, fetchSiteConfig } from './account-api.js';
import { createSyncState } from './account-sync.js';

export function installLocalAdmin({ center, catalog, local, resources, defaultCatalog }) {
  const own = local.read().collections.map(collection => collection.slug);
  const builtIns = defaultCatalog.collections[0].items
    .filter(item => item.model)
    .map(({ model, name }) => ({ id: model, name }));
  // Colecciones del sitio a las que una local puede conectarse.
  const external = catalog.collections.filter(collection => !own.includes(collection.slug));
  const sources = {
    settings: center,
    collections: local,
    resources,
    knownModels: builtIns.map(builtIn => builtIn.id),
    knownSlugs: external.map(collection => collection.slug),
  };
  const guard = (name, mount) => {
    try {
      mount();
    } catch (error) {
      console.error(`No se pudo preparar ${name}:`, error);
      center.message(`No se pudo preparar ${name}. ${error.message || error}`);
    }
  };
  guard('la pestaña Colecciones', () =>
    mountCollectionEditor(center.panel('collections'), {
      store: local,
      resources,
      builtIns,
      external,
      onResources: () => center.refreshResources(),
      // «Aplicar» recarga la página abriendo la colección editada.
      onApply: slug => {
        const next = new URLSearchParams(location.search);
        if (slug) next.set('collection', slug);
        location.search = next.toString();
      },
    }),
  );
  guard('la copia completa', () =>
    mountDeviceBackup(center.panel('profiles'), sources, {
      onImported: () => setTimeout(() => location.reload(), 1500),
    }),
  );
  // La cuenta solo existe si el sitio la activa (ACCOUNTS_ENABLED=true); por defecto está desactivada.
  fetchSiteConfig().then(config => {
    if (config.accounts)
      guard('la cuenta', () =>
        mountAccountPanel(center.panel('profiles'), { api: createAccountApi(), sources, state: createSyncState() }),
      );
  });
  return sources;
}
