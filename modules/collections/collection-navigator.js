// Navegación entre colecciones: historial para «↶ Volver», conexiones y la entrada «⊞ Más colecciones».
// createNavigator({ collections, start }) → { current, items, open, back, canGoBack, trail }.
// Not a valid catalog slug, so it can never clash with a real collection or item id.
export const MORE_SLUG = '__more';
const MORE_NAME = 'Más colecciones';

const link = (collection, section) => ({
  id: collection.slug,
  type: 'collection',
  name: collection.name,
  target: collection.slug,
  section,
});

export function createNavigator({ collections, start }) {
  const bySlug = new Map(collections.map(collection => [collection.slug, collection]));
  const stack = [bySlug.get(start?.slug) ?? collections[0]];

  // Connected collections first, then every other published one. Never the one it was opened from.
  function moreCollection(from) {
    const connected = from.items.filter(item => item.type === 'collection').map(item => item.target);
    const connectedSet = new Set(connected);
    const items = [
      ...connected.filter(slug => bySlug.has(slug)).map(slug => link(bySlug.get(slug), 'connected')),
      ...collections
        .filter(collection => collection.slug !== from.slug && !connectedSet.has(collection.slug))
        .map(collection => link(collection, 'all')),
    ];
    return { slug: MORE_SLUG, name: MORE_NAME, layout: from.layout, layoutOptions: from.layoutOptions, items };
  }

  function items(collection = stack.at(-1)) {
    if (collection.slug === MORE_SLUG || !collection.layoutOptions?.more) return collection.items;
    if (!moreCollection(collection).items.length) return collection.items;
    return [...collection.items, { id: MORE_SLUG, type: 'more', name: `⊞ ${MORE_NAME}` }];
  }

  // Opening a collection already in the history goes back to it: A → B → A leaves [A], not a cycle.
  function open(slug) {
    const existing = stack.findIndex(collection => collection.slug === slug);
    if (existing >= 0) stack.length = existing + 1;
    else if (slug === MORE_SLUG) stack.push(moreCollection(stack.at(-1)));
    else if (bySlug.has(slug)) stack.push(bySlug.get(slug));
    else return false;
    return true;
  }

  return {
    current: () => stack.at(-1),
    items,
    open,
    back() {
      if (stack.length < 2) return false;
      stack.pop();
      return true;
    },
    canGoBack: () => stack.length > 1,
    trail: () => stack.map(collection => collection.name),
  };
}
