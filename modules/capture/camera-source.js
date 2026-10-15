// Webcam del navegador: pide permiso, captura fotogramas y los envía a capture-worker.js.
// createCameraSource() devuelve start/stop y emite paquetes con el mismo formato que la OAK-D.
import { captureOptions } from './capture-normalize.js';

const cameraError = error =>
  new Error(
    {
      NotAllowedError: 'Permiso de cámara denegado. Autorízalo en el navegador e inténtalo de nuevo.',
      NotFoundError: 'No se encontró una cámara. Conecta una e inténtalo de nuevo.',
      NotReadableError: 'La cámara está ocupada o no puede abrirse. Cierra otras aplicaciones y reintenta.',
      OverconstrainedError: 'La cámara seleccionada ya no está disponible. Elige otra cámara.',
    }[error.name] ||
      error.message ||
      'No se pudo iniciar la cámara.',
  );
const cancelled = () => new DOMException('Captura cancelada', 'AbortError');

export function createCameraSource({
  onPacket = () => {},
  onStatus = () => {},
  onDevices = () => {},
  onError = () => {},
  onPreview = () => {},
} = {}) {
  const preview = document.createElement('aside');
  preview.id = 'camera-preview';
  preview.hidden = true;
  preview.setAttribute('aria-label', 'Vista previa de la cámara');
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'camera-preview-hide';
  hide.textContent = 'Ocultar vista previa';
  const video = document.createElement('video');
  video.id = 'camera-preview-video';
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  preview.append(hide, video);
  document.body.append(preview);
  let generation = 0,
    stream,
    worker,
    frameRequest,
    timer,
    cancelInit;
  let pending = false,
    active = false,
    visible = true,
    analysisFps = 15,
    captureWidth = 1280;
  let lastFrame = -Infinity,
    lastVideoTime = -1,
    processedFrames = 0,
    fps = 0,
    fpsAt = 0,
    fpsFrames = 0;

  let trackingOptions = captureOptions(),
    configurationId = 0;
  const configurations = new Map();

  function setPreview(show) {
    visible = Boolean(show);
    preview.hidden = !visible || !active;
    onPreview(visible);
  }
  hide.addEventListener('click', () => setPreview(false));
  function stop() {
    generation++;
    active = false;
    pending = false;
    cancelAnimationFrame(frameRequest);
    clearTimeout(timer);
    cancelInit?.();
    cancelInit = null;
    for (const { reject, timer } of configurations.values()) {
      clearTimeout(timer);
      reject(cancelled());
    }
    configurations.clear();
    worker?.terminate();
    worker = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    preview.hidden = true;
    onStatus('stopped');
  }
  function fail(error) {
    stop();
    onError(cameraError(error));
  }
  async function configure(options = {}) {
    const nextTracking = captureOptions({ ...trackingOptions, ...options });
    const trackingChanged =
      nextTracking.maxParticipants !== trackingOptions.maxParticipants ||
      ['x', 'y', 'width', 'height'].some(
        key => nextTracking.participationZone[key] !== trackingOptions.participationZone[key],
      );
    trackingOptions = nextTracking;
    analysisFps = Math.max(5, Math.min(30, Number(options.analysisFps) || analysisFps));
    const nextWidth = [640, 1280, 1920].includes(options.captureWidth) ? options.captureWidth : captureWidth;
    const widthChanged = nextWidth !== captureWidth;
    captureWidth = nextWidth;
    const updates = [];
    if (worker && trackingChanged)
      updates.push(
        new Promise((resolve, reject) => {
          const id = ++configurationId;
          const timeout = setTimeout(() => {
            configurations.delete(id);
            reject(new Error('El seguimiento tardó demasiado en actualizarse. Reinicia la cámara.'));
          }, 60000);
          configurations.set(id, { resolve, reject, timer: timeout });
          worker.postMessage({ type: 'configure', id, options: trackingOptions });
        }),
      );
    const track = stream?.getVideoTracks()[0];
    if (track && widthChanged)
      updates.push(
        track.applyConstraints({
          width: { ideal: captureWidth },
          height: { ideal: (captureWidth * 9) / 16 },
          frameRate: { ideal: 30 },
        }),
      );
    await Promise.all(updates);
  }
  function schedule(token) {
    if (token !== generation || !active) return;
    frameRequest = requestAnimationFrame(now => {
      schedule(token);
      if (
        pending ||
        video.readyState < 2 ||
        video.currentTime === lastVideoTime ||
        now - lastFrame < 1000 / analysisFps
      )
        return;
      pending = true;
      lastFrame = now;
      lastVideoTime = video.currentTime;
      createImageBitmap(video)
        .then(bitmap => {
          if (token !== generation || !worker) {
            bitmap.close();
            return;
          }
          worker.postMessage({ type: 'frame', bitmap, timestamp: now, fps }, [bitmap]);
          timer = setTimeout(() => {
            if (token === generation)
              fail(new Error('El seguimiento dejó de responder. Reduce la calidad y vuelve a iniciar la cámara.'));
          }, 15000);
        })
        .catch(error => {
          if (token === generation) fail(error);
        });
    });
  }
  async function start(options = {}) {
    stop();
    const token = generation;
    await configure(options);
    if (token !== generation) throw cancelled();
    onStatus('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('La cámara necesita HTTPS y un navegador compatible.');
      if (!globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap)
        throw new Error(
          'Este navegador no permite el seguimiento fuera del hilo principal. Prueba Chrome o Edge actualizado.',
        );
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
          width: { ideal: captureWidth },
          height: { ideal: (captureWidth * 9) / 16 },
          frameRate: { ideal: 30 },
        },
      });
      if (token !== generation) {
        acquired.getTracks().forEach(track => track.stop());
        throw cancelled();
      }
      stream = acquired;
      video.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (token === generation) fail(new Error('La cámara se desconectó. Conéctala y vuelve a iniciar.'));
      });
      await video.play();
      if (token !== generation) throw cancelled();
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (token !== generation) throw cancelled();
      onDevices(
        devices
          .filter(device => device.kind === 'videoinput')
          .map(device => ({ deviceId: device.deviceId, label: device.label || 'Cámara' })),
      );
      worker = new Worker(new URL('./capture-worker.js', import.meta.url), { type: 'module' });
      await new Promise((resolve, reject) => {
        cancelInit = () => reject(cancelled());
        timer = setTimeout(
          () => reject(new Error('Los modelos tardaron demasiado en cargar. Inténtalo de nuevo.')),
          60000,
        );
        worker.onerror = () => {
          const error = new Error('No se pudo cargar el seguimiento de cámara. Recarga e inténtalo de nuevo.');
          if (active) fail(error);
          else reject(error);
        };
        worker.onmessage = ({ data }) => {
          if (token !== generation) return;
          if (data.type === 'ready') {
            clearTimeout(timer);
            cancelInit = null;
            resolve();
          } else if (data.type === 'configured') {
            const update = configurations.get(data.id);
            if (update) {
              clearTimeout(update.timer);
              configurations.delete(data.id);
              update.resolve();
            }
          } else if (data.type === 'error') {
            const error = new Error('No se pudo procesar la cámara: ' + data.message);
            if (active) fail(error);
            else reject(error);
          } else if (data.type === 'packet') {
            clearTimeout(timer);
            pending = false;
            processedFrames++;
            fpsFrames++;
            const now = performance.now();
            if (now - fpsAt >= 1000) {
              fps = (fpsFrames * 1000) / (now - fpsAt);
              fpsAt = now;
              fpsFrames = 0;
            }
            data.packet.fps = Number(fps.toFixed(1));
            onPacket(data.packet);
          }
        };
        worker.postMessage({ type: 'init', options: trackingOptions });
      });
      if (token !== generation) throw cancelled();
      active = true;
      processedFrames = 0;
      fps = 0;
      fpsFrames = 0;
      fpsAt = performance.now();
      lastFrame = -Infinity;
      lastVideoTime = -1;
      setPreview(visible);
      onStatus('streaming');
      schedule(token);
    } catch (error) {
      if (token !== generation) throw cancelled();
      const message = cameraError(error);
      stop();
      onError(message);
      throw message;
    }
  }
  return {
    start,
    stop,
    configure,
    setPreview,
    metrics: () => ({
      active,
      pending,
      analysisFps: active ? fps : 0,
      captureFps: stream?.getVideoTracks()[0]?.getSettings().frameRate || 0,
      processedFrames,
      maxParticipants: trackingOptions.maxParticipants,
      participationZone: { ...trackingOptions.participationZone },
      captureWidth: video.videoWidth,
      captureHeight: video.videoHeight,
      previewVisible: visible,
    }),
  };
}
