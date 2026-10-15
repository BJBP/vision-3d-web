// Fuentes de captura: OAK-D por WebSocket, webcam del navegador, demo o ninguna. Gestiona conexión,
// reconexión y cambio de fuente; cada paquete recibido se entrega a onPacket (formato en docs/contracts.md).
import { createCameraSource } from '../modules/capture/index.js';

const WEBCAM_STATUS = {
  starting: 'Preparando cámara y modelos…',
  streaming: 'Webcam activa · sin profundidad medida',
  stopped: 'Fuente detenida',
};

const URL_SOURCES = ['webcam', 'oak', 'demo'];

// Explicit URL choices override the presentation default: browser webcam.
export function initialSource(params) {
  if (params.get('demo') === '1') return 'demo';
  if (URL_SOURCES.includes(params.get('source'))) return params.get('source');
  if (params.get('ws') === 'off') return 'off';
  return params.get('ws') ? 'oak' : 'webcam';
}

// center: panel de configuración. getCaptureOptions() → { captureWidth, analysisFps, preview }.
// onSwitch(source) resets the app state; onFail(error) reports a failed start.
export function createCaptureSources({ params, center, getCaptureOptions, onPacket, onSwitch, onFail, onPreview }) {
  let mode = initialSource(params);
  let socket = null,
    reconnectTimer = null,
    version = 0,
    lastLiveRequest,
    webcamRunning = false;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const defaultEndpoint =
    params.get('ws') === 'off' ? '' : `${scheme}://${location.hostname || 'localhost'}:${params.get('ws') || 8765}`;

  const webcam = createCameraSource({
    onPacket: packet => {
      if (mode === 'webcam') onPacket(packet);
    },
    onStatus: state => {
      if (state === 'stopped' && mode === 'webcam') onPacket({ cam: false });
      center?.status(WEBCAM_STATUS[state] || state);
    },
    onDevices: list => center?.devices(list),
    onError: error => {
      center?.message(error.message);
      // Startup failures are reported by select(); later failures need the same visible retry.
      if (mode === 'webcam' && webcamRunning) {
        webcamRunning = false;
        mode = 'off';
        center?.status('No se pudo mantener la cámara');
        onFail(error);
      }
    },
    onPreview,
  });

  function closeSocket() {
    if (!socket) return;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
    socket = null;
  }

  function connectOak(endpoint, requested = version) {
    if (mode !== 'oak' || requested !== version) return;
    socket = new WebSocket(endpoint);
    socket.onmessage = event => {
      if (mode !== 'oak' || requested !== version) return;
      try {
        const packet = JSON.parse(event.data);
        onPacket(packet);
        center?.status(packet?.cam === true ? 'OAK-D conectada' : 'Esperando captura OAK-D…');
      } catch {
        /* Ignore malformed camera messages. */
      }
    };
    socket.onclose = () => {
      if (mode !== 'oak' || requested !== version) return;
      onPacket({ cam: false });
      center?.status('Servicio OAK-D sin conexión; reintentando…');
      reconnectTimer = setTimeout(() => connectOak(endpoint, requested), 1500);
    };
    socket.onerror = () => socket?.close();
  }

  // fallback: fuente a usar si esta no puede iniciarse (p. ej. 'demo' si se niega el permiso de cámara).
  async function select({ source, deviceId = '', endpoint = defaultEndpoint, fallback }) {
    const requested = ++version;
    center?.message('');
    if (source === 'webcam' || source === 'oak') lastLiveRequest = { source, deviceId, endpoint };
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeSocket();
    webcamRunning = false;
    webcam.stop();
    mode = source;
    onSwitch(source);
    if (source !== 'off') center?.source(source);
    if (source === 'demo') {
      center?.status('Demostración · movimiento simulado');
      return;
    }
    if (source === 'off') {
      center?.status('Fuente detenida');
      return;
    }
    try {
      if (source === 'webcam') {
        const { preview, ...captureOptions } = getCaptureOptions();
        await webcam.start({ deviceId, ...captureOptions });
        if (requested !== version) return;
        webcamRunning = true;
        webcam.setPreview(preview);
      } else if (source === 'oak') {
        const url = new URL(endpoint);
        const insecure = location.protocol === 'https:' && url.protocol !== 'wss:';
        if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || insecure)
          throw Error('Usa un servicio OAK-D con WebSocket seguro (wss://) en HTTPS.');
        center?.status('Conectando al servicio OAK-D…');
        connectOak(url.href, requested);
      }
    } catch (error) {
      if (requested !== version || error.name === 'AbortError') return;
      mode = 'off';
      onFail(error);
      if (fallback) {
        await select({ source: fallback });
        center?.message(`${error.message} Se muestra la demostración; elige la fuente en Configuración.`);
        return;
      }
      center?.status('No se pudo iniciar la fuente');
      center?.message(error.message);
    }
  }

  // Return from demo to the last live source, otherwise honor the explicit URL choice.
  function liveRequest() {
    if (lastLiveRequest) return lastLiveRequest;
    const source = initialSource(params);
    if (source !== 'demo') return { source };
    if (params.get('ws') === 'off') return { source: 'off' };
    return { source: params.get('ws') ? 'oak' : 'webcam' };
  }

  addEventListener('pagehide', () => {
    version++;
    mode = 'off';
    clearTimeout(reconnectTimer);
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    webcam.stop();
  });

  return {
    webcam,
    defaultEndpoint,
    select,
    liveRequest,
    get mode() {
      return mode;
    },
  };
}
