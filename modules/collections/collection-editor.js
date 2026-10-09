// Pestaña «Colecciones» de Configuración: crea y edita las colecciones de este navegador (sin cuenta ni servidor).
// mountCollectionEditor(raíz, { store, resources, builtIns, external, onApply, onResources }) pinta el editor; todo
// el texto del usuario va por textContent/value, nunca como HTML.
import {
  addCollection,
  addItem,
  moveItem,
  removeCollection,
  removeItem,
  updateCollection,
} from './collection-drafts.js';
import { glbAnimationNames } from './glb-info.js';

// Valor del selector de animación para «sin animación» (no puede chocar con un nombre de clip real).
const NO_ANIMATION = '\u0000none';
const TYPE_LABELS = { model: 'MODELO', video: 'VÍDEO', avatar: 'AVATAR', collection: 'COLECCIÓN' };
const LAYOUT_LABELS = [
  ['ribbon', 'Cinta'],
  ['carousel', 'Carrusel'],
  ['grid', 'Cuadrícula'],
];
const ADD_KINDS = [
  ['glb', 'Modelo GLB'],
  ['video', 'Vídeo'],
  ['builtin', 'Modelo integrado'],
  ['avatar', 'Avatar'],
  ['collection', 'Conexión a otra colección'],
];

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const row = (label, control) =>
  el('label', { className: 'settings-row' }, [el('span', { textContent: label }), control]);
const button = (text, onclick, props = {}) => el('button', { type: 'button', textContent: text, onclick, ...props });
const options = (select, pairs) => select.replaceChildren(...pairs.map(([value, text]) => new Option(text, value)));

export function mountCollectionEditor(
  root,
  { store, resources, builtIns = [], external = [], onApply = () => {}, onResources = () => {} },
) {
  let data = store.read();
  let selected = data.collections[0]?.slug ?? '';
  const status = el('p', { className: 'settings-help', role: 'status' });
  const say = text => (status.textContent = text);

  function save(text = 'Guardado en este navegador. Pulsa Aplicar para verlo.') {
    const warnings = store.save(data, { knownModels: builtIns.map(b => b.id), knownSlugs: external.map(c => c.slug) });
    data = store.read();
    say(warnings.length ? warnings[0] : text);
    render();
  }
  // Ejecuta una edición y guarda; los errores se muestran en la pestaña.
  const edit = (action, text) => async () => {
    try {
      if ((await action()) !== false) save(text);
    } catch (error) {
      say(error.message || String(error));
    }
  };

  const list = el('select', { id: 'collections-local', onchange: () => ((selected = list.value), render()) });
  const newName = el('input', { type: 'text', maxLength: 60, placeholder: 'Ferias 2026' });
  const create = edit(() => {
    selected = addCollection(
      data,
      newName.value,
      external.map(c => c.slug),
    );
    newName.value = '';
  }, 'Colección creada. Añade elementos.');
  const details = el('div');
  root.replaceChildren(
    el('h3', { textContent: 'Colecciones de este dispositivo' }),
    row('Colección', list),
    el('div', { className: 'settings-actions' }, [newName, button('+ Nueva', create)]),
    details,
    el('div', { className: 'settings-actions' }, [
      button('Aplicar', () => onApply(selected), { className: 'settings-primary' }),
    ]),
    status,
    el('p', {
      className: 'settings-help',
      textContent:
        'Se guardan solo en este navegador y se suman a las colecciones del sitio. Los archivos quedan en Recursos.',
    }),
  );

  function collectionFields(collection) {
    const name = el('input', { type: 'text', maxLength: 60, value: collection.name });
    name.onchange = edit(() => updateCollection(data, collection.slug, { name: name.value }));
    const start = el('input', { type: 'checkbox', checked: collection.start });
    start.onchange = edit(() => updateCollection(data, collection.slug, { start: start.checked }));
    const layout = el('select');
    options(layout, LAYOUT_LABELS);
    layout.value = collection.layout;
    layout.onchange = edit(() => updateCollection(data, collection.slug, { layout: layout.value }));
    const opts = collection.layoutOptions;
    const setOption = (key, value) =>
      edit(() => updateCollection(data, collection.slug, { layoutOptions: { [key]: value() } }));
    const visible = el('input', { type: 'number', min: 3, max: 12, value: opts.visible });
    visible.onchange = setOption('visible', () => Math.min(12, Math.max(3, Math.round(Number(visible.value)) || 5)));
    const rotation = el('input', { type: 'number', min: 0, max: 120, value: opts.rotationSeconds });
    rotation.onchange = setOption('rotationSeconds', () => Math.min(120, Math.max(0, Number(rotation.value) || 0)));
    const labels = el('input', { type: 'checkbox', checked: opts.labels });
    labels.onchange = setOption('labels', () => labels.checked);
    const more = el('input', { type: 'checkbox', checked: opts.more });
    more.onchange = setOption('more', () => more.checked);
    const remove = edit(() => {
      if (!confirm(`¿Borrar la colección «${collection.name}»? Sus archivos siguen en Recursos.`)) return false;
      removeCollection(data, collection.slug);
      selected = data.collections[0]?.slug ?? '';
    }, 'Colección borrada.');
    return [
      row('Nombre', name),
      row('Abrir al inicio', start),
      row('Vista', layout),
      row('Visibles a la vez', visible),
      row('Etiquetas de tipo', labels),
      row('«Más colecciones»', more),
      row('Rotación (s, 0 = no)', rotation),
      el('div', { className: 'settings-actions' }, [button('Borrar colección', remove)]),
    ];
  }

  function itemList(collection) {
    const items = collection.items.map((item, index) => {
      const sound = item.soundResource ? ' ♪' : '';
      const label = `${String(index + 1).padStart(2, '0')} ${item.type === 'collection' ? '→ ' : ''}${item.name}${sound}`;
      return el('li', { className: 'collections-item' }, [
        el('span', { textContent: label }),
        el('small', { textContent: TYPE_LABELS[item.type] }),
        button(
          '↑',
          edit(() => moveItem(data, collection.slug, index, -1)),
          { ariaLabel: `Subir ${item.name}` },
        ),
        button(
          '↓',
          edit(() => moveItem(data, collection.slug, index, 1)),
          { ariaLabel: `Bajar ${item.name}` },
        ),
        button(
          '✕',
          edit(() => removeItem(data, collection.slug, index)),
          { ariaLabel: `Quitar ${item.name}` },
        ),
      ]);
    });
    if (!items.length) items.push(el('li', { className: 'settings-help', textContent: 'Sin elementos todavía.' }));
    return el('ol', { className: 'collections-items' }, items);
  }

  function addForm(collection) {
    const kind = el('select');
    options(kind, ADD_KINDS);
    const name = el('input', { type: 'text', maxLength: 60, placeholder: 'Silla' });
    const file = el('input', { type: 'file' });
    const builtIn = el('select');
    options(
      builtIn,
      builtIns.map(b => [b.id, b.name]),
    );
    const target = el('select');
    const targets = [...data.collections, ...external].filter(c => c.slug !== collection.slug);
    options(target, [...new Map(targets.map(c => [c.slug, c.name]))]);
    const animation = el('select');
    const sound = el('input', { type: 'file', accept: '.mp3,.ogg,.oga,.wav,.m4a,audio/*' });
    const fileRow = row('Archivo', file);
    const builtInRow = row('Modelo', builtIn);
    const targetRow = row('Colección', target);
    const animationRow = row('Animación', animation);
    const soundRow = row('Sonido al abrir (opcional)', sound);
    animationRow.hidden = true;
    const sync = () => {
      fileRow.hidden = !['glb', 'video'].includes(kind.value);
      soundRow.hidden = kind.value === 'collection';
      if (kind.value !== 'glb') animationRow.hidden = true;
      file.accept = kind.value === 'glb' ? '.glb,model/gltf-binary' : '.mp4,.webm,video/mp4,video/webm';
      builtInRow.hidden = kind.value !== 'builtin';
      targetRow.hidden = kind.value !== 'collection';
      if (!name.value && kind.value === 'avatar') name.value = 'Avatar';
    };
    kind.onchange = sync;
    file.onchange = async () => {
      if (!name.value && file.files[0]) name.value = file.files[0].name.replace(/\.[^.]+$/, '').slice(0, 60);
      // Si el GLB trae animaciones, se elige cuál reproducir al abrirlo (por defecto, la primera).
      const names = kind.value === 'glb' && file.files[0] ? glbAnimationNames(await file.files[0].arrayBuffer()) : [];
      options(animation, [...names.map(clip => [clip, clip]), [NO_ANIMATION, 'Sin animación']]);
      animationRow.hidden = !names.length;
    };
    const add = edit(async () => {
      const fields = { name: name.value };
      if (kind.value === 'glb' || kind.value === 'video') {
        if (!file.files[0]) throw new Error('Elige un archivo.');
        say('Guardando el archivo…');
        const type = kind.value === 'glb' ? 'model' : 'video';
        const entry = await resources.add(file.files[0], type);
        onResources();
        Object.assign(fields, { type, resource: entry.id });
        if (type === 'model' && !animationRow.hidden)
          fields.animation = animation.value === NO_ANIMATION ? false : animation.value;
      } else if (kind.value === 'builtin') Object.assign(fields, { type: 'model', model: builtIn.value });
      else if (kind.value === 'collection') {
        if (!target.value) throw new Error('Primero crea otra colección a la que conectar.');
        Object.assign(fields, { type: 'collection', target: target.value });
      } else fields.type = 'avatar';
      if (fields.type !== 'collection' && sound.files[0]) {
        say('Guardando el sonido…');
        fields.soundResource = (await resources.add(sound.files[0], 'audio')).id;
        onResources();
      }
      addItem(data, collection.slug, fields);
    }, 'Elemento añadido.');
    sync();
    return el('fieldset', { className: 'collections-add' }, [
      el('legend', { textContent: 'Añadir elemento' }),
      row('Tipo', kind),
      row('Nombre', name),
      fileRow,
      builtInRow,
      targetRow,
      animationRow,
      soundRow,
      el('div', { className: 'settings-actions' }, [button('Añadir', add)]),
    ]);
  }

  function render() {
    options(
      list,
      data.collections.map(c => [c.slug, `${c.name}${c.start ? ' ★' : ''}`]),
    );
    list.value = selected;
    list.disabled = !data.collections.length;
    const collection = data.collections.find(c => c.slug === selected);
    details.replaceChildren(
      ...(collection
        ? [
            ...collectionFields(collection),
            el('h3', { textContent: 'Elementos' }),
            itemList(collection),
            addForm(collection),
          ]
        : [
            el('p', {
              className: 'settings-help',
              textContent: 'Aún no hay colecciones. Escribe un nombre y pulsa + Nueva.',
            }),
          ]),
    );
  }

  render();
  return { refresh: () => ((data = store.read()), render()) };
}
