// Cuenta del sitio (PocketBase, colección «users») y su copia sincronizada «device_sync» (docs/collections.md).
// createAccountApi({ base, fetcher }) → login, refresh, readSync, saveSync, uploadFile, removeFiles, download.
const SYNC = 'api/collections/device_sync/records';

// Interruptores del sitio (Caddy, ACCOUNTS_ENABLED en .env). Sin servidor o con cualquier fallo: todo apagado.
export async function fetchSiteConfig({ base = './', fetcher = globalThis.fetch?.bind(globalThis) } = {}) {
  try {
    const response = await fetcher(`${base}api/site/config`, { cache: 'no-cache' });
    if (!response.ok) return { accounts: false };
    const config = await response.json();
    return { accounts: config?.accounts === true };
  } catch (error) {
    console.info('Sin configuración del sitio; cuentas desactivadas:', error.message || error);
    return { accounts: false };
  }
}

export function createAccountApi({ base = './', fetcher = globalThis.fetch?.bind(globalThis) } = {}) {
  async function request(path, { token, method = 'GET', json, form } = {}) {
    const headers = token ? { Authorization: token } : {};
    if (json) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetcher(base + path, { method, headers, body: json ? JSON.stringify(json) : form });
    } catch (error) {
      throw new Error(`Sin conexión con el servidor de cuentas (${error.message || error}).`);
    }
    if (response.status === 401 || response.status === 403)
      throw Object.assign(new Error('La sesión caducó; vuelve a iniciar sesión.'), { expired: true });
    if (!response.ok) {
      if (response.status === 429) throw new Error('Demasiados intentos seguidos; espera un minuto.');
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(body.message || `El servidor de cuentas respondió ${response.status}.`), {
        status: response.status,
      });
    }
    return response.json();
  }

  return {
    async login(email, password) {
      const path = 'api/collections/users/auth-with-password';
      try {
        const body = await request(path, { method: 'POST', json: { identity: email, password } });
        return { token: body.token, userId: body.record.id, email: body.record.email };
      } catch (error) {
        // PocketBase responde 400 (en inglés) tanto si el correo no existe como si la contraseña es incorrecta.
        throw error.expired || error.status === 400 ? new Error('Correo o contraseña incorrectos.') : error;
      }
    },
    async refresh(token) {
      const body = await request('api/collections/users/auth-refresh', { token, method: 'POST' });
      return { token: body.token, userId: body.record.id, email: body.record.email };
    },
    // El registro de este usuario o null si aún no ha sincronizado nunca.
    async readSync({ token, userId }) {
      const filter = encodeURIComponent(`user="${userId}"`);
      const body = await request(`${SYNC}?perPage=1&filter=${filter}`, { token });
      return body.items[0] ?? null;
    },
    // Crea o actualiza la descripción del dispositivo (el JSON «data»).
    saveSync({ token, userId }, record, data) {
      return record
        ? request(`${SYNC}/${record.id}`, { token, method: 'PATCH', json: { data } })
        : request(SYNC, { token, method: 'POST', json: { user: userId, data } });
    },
    // Sube un archivo y devuelve el nombre con el que lo guardó el servidor (lo renombra).
    async uploadFile(session, record, blob, name) {
      const form = new FormData();
      form.append('files+', blob, name);
      const updated = await request(`${SYNC}/${record.id}`, { token: session.token, method: 'PATCH', form });
      const added = updated.files.filter(file => !record.files.includes(file));
      if (added.length !== 1) throw new Error('El servidor no confirmó el archivo subido.');
      return { record: updated, file: added[0] };
    },
    removeFiles(session, record, files) {
      return request(`${SYNC}/${record.id}`, { token: session.token, method: 'PATCH', json: { 'files-': files } });
    },
    // Los archivos están protegidos: hace falta un token de archivo de corta duración.
    async download(session, record, file) {
      const { token } = await request('api/files/token', { token: session.token, method: 'POST' });
      const path = `api/files/device_sync/${encodeURIComponent(record.id)}/${encodeURIComponent(file)}`;
      const response = await fetcher(`${base}${path}?token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(`No se pudo descargar un archivo de tu cuenta (${response.status}).`);
      return response.blob();
    },
  };
}
