// Interfaz pública del módulo collections: contrato del catálogo, carga y elección de la colección de inicio.
// Otros módulos y app.js importan SOLO desde este archivo.
export { validateCatalog, ITEM_TYPES, LAYOUTS, DEFAULT_LAYOUT_OPTIONS } from './catalog-contract.js';
export { loadCatalog, pickStart, catalogMessage } from './catalog-loader.js';
export { createNavigator, MORE_SLUG } from './collection-navigator.js';
export { adminToken } from './catalog-api.js';
export { createLocalCollections, mergeCatalogs } from './local-collections.js';
export { mountCollectionEditor } from './collection-editor.js';
