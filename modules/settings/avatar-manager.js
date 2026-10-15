// Administrador de avatares (Configuración → Apariencia): lista los integrados y los GLB de la biblioteca con miniatura
// y «Sigue el cuerpo», y permite usar, renombrar, descargar, borrar y añadir. mountAvatarManager(container, { settings,
// resources, inspect, thumbnail }). `inspect` y `thumbnail` (Blob → promesa) los da la composición: settings no conoce avatar.
import { downloadBlob } from './download.js';

const describeInfo = info =>
  info.error
    ? `No se pudo leer el GLB: ${info.error}`
    : `GLB · Sigue el cuerpo: ${info.tracking ? 'sí' : 'no'}` +
      (info.animations ? ` · ${info.animations} animaciones` : '');

function button(label, action, key) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.dataset.action = action;
  element.dataset.key = key;
  return element;
}

// Fila de la lista: miniatura (o inicial), nombre, descripción y botones. Los textos van con textContent.
function row({ key, name, meta, active, image, actions }) {
  const item = document.createElement('li'),
    picture = document.createElement('span'),
    text = document.createElement('div'),
    title = document.createElement('strong'),
    detail = document.createElement('small'),
    tools = document.createElement('div');
  item.className = 'avatar-row';
  item.classList.toggle('is-active', active);
  picture.className = 'avatar-thumb';
  picture.setAttribute('aria-hidden', 'true');
  if (image) picture.style.backgroundImage = `url("${image}")`;
  else picture.textContent = name.trim().charAt(0).toUpperCase() || '?';
  title.textContent = name;
  detail.textContent = meta;
  text.append(title, detail);
  tools.className = 'avatar-tools';
  const use = button(active ? 'En uso' : 'Usar', 'use', key);
  use.setAttribute('aria-pressed', String(active));
  use.setAttribute('aria-label', `${active ? 'En uso' : 'Usar'}: ${name}`);
  tools.append(use, ...actions.map(([label, action]) => button(label, action, key)));
  item.append(picture, text, tools);
  return { item, picture, detail };
}

export function mountAvatarManager(container, { settings, resources, inspect, thumbnail }) {
  const section = document.createElement('section');
  section.className = 'avatar-manager';
  section.setAttribute('aria-labelledby', 'avatar-manager-title');
  section.innerHTML = `<h3 id="avatar-manager-title">Avatares</h3><p class="settings-help">Elige el avatar de la escena con un clic. Los GLB se guardan en este navegador; «Sigue el cuerpo» indica si su esqueleto puede imitar tus movimientos.</p><ul class="avatar-list"></ul><label class="settings-import">Añadir avatar GLB<input type="file" accept=".glb,model/gltf-binary"></label><p class="avatar-manager-status" role="status"></p>`;
  container.prepend(section);
  const list = section.querySelector('.avatar-list'),
    status = section.querySelector('.avatar-manager-status'),
    upload = section.querySelector('input[type=file]');
  const builtIns = [...container.querySelectorAll('[data-setting="appearance"] option')].map(option => ({
    id: option.value,
    name: option.textContent,
  }));
  const details = new Map();
  let queue = Promise.resolve(),
    values = null,
    library = [];

  // Analiza y fotografía cada GLB una sola vez, de uno en uno para no frenar la escena.
  function describe(entry) {
    if (!details.has(entry.id)) {
      const job = queue.then(async () => {
        const info = await inspect(entry.blob).catch(error => ({ error: error.message || String(error) }));
        const image = info.error ? null : await thumbnail(entry.blob).catch(() => null);
        return { info, image };
      });
      queue = job.catch(() => {});
      details.set(entry.id, job);
    }
    return details.get(entry.id);
  }

  function modelRow(entry) {
    const parts = row({
      key: entry.id,
      name: entry.name,
      meta: 'GLB · Analizando…',
      active: values.modelId === entry.id,
      image: null,
      actions: [
        ['Renombrar', 'rename'],
        ['Descargar', 'download'],
        ['Borrar', 'delete'],
      ],
    });
    describe(entry).then(({ info, image }) => {
      parts.detail.textContent = describeInfo(info);
      if (image) {
        parts.picture.textContent = '';
        parts.picture.style.backgroundImage = `url("${image}")`;
      }
    });
    return parts.item;
  }

  function render() {
    const active = document.activeElement,
      focused = list.contains(active) && active.dataset.key ? { ...active.dataset } : null;
    list.replaceChildren(
      ...builtIns.map(
        avatar =>
          row({
            key: `appearance:${avatar.id}`,
            name: avatar.name,
            meta: 'Integrado · Sigue el cuerpo: sí',
            active: !values.modelId && values.surface && values.appearance === avatar.id,
            actions: [],
          }).item,
      ),
      ...library.map(modelRow),
    );
    // Redibujar no debe quitar el foco del teclado al botón que se acaba de pulsar.
    if (focused)
      list.querySelector(`[data-key="${CSS.escape(focused.key)}"][data-action="${focused.action}"]`)?.focus();
  }

  async function act(action, key) {
    if (key.startsWith('appearance:')) return settings.useAvatar({ appearance: key.slice('appearance:'.length) });
    const entry = library.find(item => item.id === key);
    if (!entry) throw Error('Ese avatar ya no está en la biblioteca.');
    if (action === 'use') return settings.useAvatar({ modelId: entry.id });
    if (action === 'download')
      return downloadBlob(entry.blob, /\.glb$/i.test(entry.name) ? entry.name : `${entry.name}.glb`);
    if (action === 'rename') {
      const name = prompt('Nuevo nombre del avatar', entry.name);
      if (name === null) return;
      await resources.rename(entry.id, name);
      return settings.refreshResources();
    }
    if (action === 'delete') {
      if (settings.resourceInUse(entry.id))
        throw Error(
          'Está en uso por la escena o por un perfil. Elige otro avatar o cambia ese perfil antes de borrarlo.',
        );
      if (!confirm(`¿Borrar el avatar «${entry.name}» de este navegador?`)) return;
      await resources.remove(entry.id);
      details.delete(entry.id);
      return settings.refreshResources();
    }
  }

  list.addEventListener('click', async event => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;
    try {
      status.textContent = '';
      await act(target.dataset.action, target.dataset.key);
    } catch (error) {
      status.textContent = `No se completó la acción. ${error.message || error}`;
    }
  });
  upload.onchange = async () => {
    try {
      const file = upload.files[0];
      if (!file) return;
      const entry = await resources.add(file, 'model');
      await settings.refreshResources();
      status.textContent = `Avatar «${entry.name}» añadido. Pulsa Usar para verlo en la escena.`;
    } catch (error) {
      status.textContent = `No se añadió el avatar. ${error.message || error}`;
    } finally {
      upload.value = '';
    }
  };
  settings.watch((next, items) => {
    values = next;
    library = items.filter(item => item.type === 'model');
    render();
  });
}
