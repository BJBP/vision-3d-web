// Registra el service worker (web/sw.js) que guarda la web, el catálogo y los modelos ya vistos para usarlos
// sin red. installOfflineCache({ params, container, timing, page }) → Promise<boolean>; ?sw=off lo desactiva.
const pageResources = (timing, page) =>
  timing
    .getEntriesByType('resource')
    .map(entry => entry.name)
    .concat(page.href);

export async function installOfflineCache({
  params,
  container = globalThis.navigator?.serviceWorker,
  timing = globalThis.performance,
  page = globalThis.location,
} = {}) {
  if (!container || params.get('sw') === 'off') return false;
  try {
    await container.register('./sw.js', { scope: './' });
    // Lo cargado antes de que el service worker controle la página (primera visita) se guarda aparte.
    const remember = async () => {
      const registration = await container.ready;
      registration.active?.postMessage({ type: 'remember', urls: pageResources(timing, page) });
    };
    if (!container.controller) container.addEventListener('controllerchange', remember, { once: true });
    await remember();
    return true;
  } catch (error) {
    console.warn('No se pudo activar el uso sin conexión (service worker):', error);
    return false;
  }
}
