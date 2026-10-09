// Sección «Cuenta» de Configuración → Perfiles: inicia sesión y sincroniza este dispositivo con la cuenta.
// mountAccountPanel(raíz, { api, sources, state }) sincroniza al abrir la página si hay sesión; si baja cambios,
// recarga. Sin servidor de cuentas (GitHub Pages, servidor de demo) solo lo indica.
import { planSync, pullDevice, pushDevice } from './account-sync.js';
import { describeDevice } from './device-backup.js';

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const button = (text, onclick) => el('button', { type: 'button', textContent: text, onclick });
const time = iso => (iso ? new Date(iso).toLocaleString('es') : 'nunca');

export function mountAccountPanel(root, { api, sources, state, reload = () => location.reload() }) {
  const body = el('div');
  const status = el('p', { className: 'settings-help', role: 'status' });
  const say = text => (status.textContent = text);
  root.append(el('h3', { textContent: 'Cuenta (opcional)' }), body, status);
  let busy = false;

  const session = () => {
    const { token, userId, email } = state.read();
    return token ? { token, userId, email } : null;
  };
  function remember(changes) {
    state.write({ ...state.read(), ...changes });
  }
  function signOut(text = 'Sesión cerrada. Lo guardado en este dispositivo se conserva.') {
    state.clear();
    say(text);
    render();
  }

  async function finish(result, action) {
    remember({ lastHash: result.hash, lastRemote: result.record.updated, lastAt: new Date().toISOString() });
    if (action === 'pull') {
      say('Cambios de tu cuenta descargados. Recargando…');
      setTimeout(reload, 800);
    } else say(action === 'push' ? 'Este dispositivo se guardó en tu cuenta.' : 'Todo está al día.');
    render();
  }

  // `force`: 'push' o 'pull' cuando la persona resuelve un conflicto.
  async function sync(force = null) {
    if (busy || !session()) return;
    busy = true;
    try {
      say('Sincronizando…');
      const fresh = await api.refresh(session().token);
      remember(fresh);
      const remote = await api.readSync(fresh);
      const plan = force ?? planSync({ device: await describeDevice(sources), state: state.read(), remote });
      if (plan === 'conflict') {
        say('');
        render(true);
        return;
      }
      const args = { api, session: fresh, sources, remote, onProgress: say };
      if (plan === 'push') await finish(await pushDevice(args), 'push');
      else if (plan === 'pull') await finish(await pullDevice(args), 'pull');
      else
        await finish({ hash: state.read().lastHash, record: remote ?? { updated: state.read().lastRemote } }, 'none');
    } catch (error) {
      if (error.expired) signOut('La sesión caducó; vuelve a iniciar sesión.');
      else say(`No se pudo sincronizar. ${error.message || error}`);
    } finally {
      busy = false;
    }
  }

  function loginForm() {
    const email = el('input', { type: 'email', autocomplete: 'username', placeholder: 'tu@correo' });
    const password = el('input', { type: 'password', autocomplete: 'current-password' });
    const submit = async () => {
      try {
        say('Iniciando sesión…');
        remember(await api.login(email.value.trim(), password.value));
        password.value = '';
        render();
        await sync();
      } catch (error) {
        say(error.message || String(error));
      }
    };
    password.onkeydown = event => event.key === 'Enter' && submit();
    return [
      el('p', {
        className: 'settings-help',
        textContent:
          'Con una cuenta, la escena, los perfiles, las colecciones locales y sus archivos se guardan en el servidor y pasan a tus otros dispositivos. Las cuentas las crea el administrador del sitio.',
      }),
      el('label', { className: 'settings-row' }, [el('span', { textContent: 'Correo' }), email]),
      el('label', { className: 'settings-row' }, [el('span', { textContent: 'Contraseña' }), password]),
      el('div', { className: 'settings-actions' }, [button('Iniciar sesión', submit)]),
    ];
  }

  function connected(conflict) {
    const { email, lastAt } = state.read();
    if (conflict)
      return [
        el('p', {
          className: 'settings-help',
          textContent:
            'Hay cambios en este dispositivo y también en tu cuenta. ¿Cuáles conservas? Los otros se pierden.',
        }),
        el('div', { className: 'settings-actions' }, [
          button('Usar los de mi cuenta', () => sync('pull')),
          button('Usar los de este dispositivo', () => sync('push')),
        ]),
      ];
    return [
      el('p', {
        className: 'settings-help',
        textContent: `Conectado como ${email}. Última sincronización: ${time(lastAt)}.`,
      }),
      el('div', { className: 'settings-actions' }, [
        button('Sincronizar ahora', () => sync()),
        button('Cerrar sesión', () => signOut()),
      ]),
    ];
  }

  function render(conflict = false) {
    body.replaceChildren(...(session() ? connected(conflict) : loginForm()));
  }

  render();
  // Al abrir la página: si hay sesión, se sincroniza sola.
  if (session()) sync();
  return { sync };
}
