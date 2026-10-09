import * as THREE from 'three';

// One video decoder and texture serve both renderers' scene passes.
export function createSceneBackground({ resources, onChange = () => {}, onStatus = () => {} } = {}) {
  let current = {},
    key = '',
    generation = 0,
    texture = null,
    video = null,
    objectUrl = '',
    error = '',
    manualPlay = false;
  const fallback = () => new THREE.Color(current.bgColor || '#050b0c');
  function notify() {
    onChange({
      backgroundTexture: texture,
      backgroundIntensity: video ? 1 - current.videoDim : 1,
      backgroundValue: texture || fallback(),
    });
  }
  function release() {
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      video = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    texture?.dispose();
    texture = null;
  }
  function fit() {
    if (!video || !texture || !video.videoWidth || !video.videoHeight) return;
    const image = video.videoWidth / video.videoHeight,
      view = innerWidth / innerHeight;
    texture.repeat.set(image > view ? view / image : 1, image > view ? 1 : image / view);
    texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
    texture.updateMatrix();
  }
  async function playback() {
    if (!video) return;
    if (document.hidden || current.videoPaused || (current.reducedMotion && !manualPlay)) {
      video.pause();
      onStatus('Vídeo pausado. Puedes reproducirlo manualmente.');
      return;
    }
    const playing = video;
    try {
      await playing.play();
      if (playing === video) onStatus('Vídeo de fondo en reproducción.');
    } catch {
      if (playing === video) onStatus('El navegador pausó el vídeo. Pulsa Reproducir para iniciarlo.');
    }
  }
  async function configure(options, forcePlay = false) {
    const previous = current;
    current = { ...options };
    const nextKey =
      current.background === 'video'
        ? `video:${current.videoSource}:${current.videoSource === 'url' ? current.videoUrl : current.videoId}`
        : `${current.background}:${current.bgColor}:${current.bgEnd}`;
    if (nextKey === key) {
      if (video) {
        video.loop = current.videoLoop;
        if (current.reducedMotion && !previous.reducedMotion) manualPlay = false;
        if (previous.videoPaused && !current.videoPaused) manualPlay = true;
        fit();
        void playback();
      }
      notify();
      return;
    }
    key = nextKey;
    const ticket = ++generation;
    release();
    error = '';
    manualPlay = forcePlay;
    notify();
    if (current.background === 'gradient') {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d'),
        gradient = ctx.createLinearGradient(0, 0, 256, 256);
      gradient.addColorStop(0, current.bgColor);
      gradient.addColorStop(1, current.bgEnd);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      notify();
      return;
    }
    if (current.background !== 'video') {
      onStatus('');
      return;
    }
    onStatus('Cargando vídeo de fondo…');
    try {
      let source;
      if (current.videoSource === 'url') {
        const url = new URL(current.videoUrl);
        if (url.protocol !== 'https:' || url.username || url.password)
          throw Error('Usa una URL HTTPS directa de vídeo sin credenciales.');
        source = url.href;
      } else {
        const item = await resources.get(current.videoId);
        if (ticket !== generation) return;
        if (!item || item.type !== 'video')
          throw Error('No se encuentra el vídeo local. Importa el archivo y selecciónalo de nuevo.');
        objectUrl = URL.createObjectURL(item.blob);
        source = objectUrl;
      }
      if (ticket !== generation) return;
      const element = document.createElement('video');
      video = element;
      element.muted = true;
      element.defaultMuted = true;
      element.playsInline = true;
      element.loop = current.videoLoop;
      element.preload = 'auto';
      element.crossOrigin = 'anonymous';
      element.hidden = true;
      element.setAttribute('aria-hidden', 'true');
      element.id = 'scene-background-video';
      document.body.append(element);
      const fail = () => {
        if (ticket !== generation || video !== element) return;
        error = 'No se pudo reproducir el vídeo. Comprueba el formato y, para una URL, que el servidor permita CORS.';
        release();
        notify();
        onStatus(error);
      };
      element.addEventListener('error', fail, { once: true });
      element.addEventListener(
        'loadeddata',
        () => {
          if (ticket !== generation || video !== element) return;
          texture = new THREE.VideoTexture(element);
          texture.colorSpace = THREE.SRGBColorSpace;
          // A paused first frame will not produce a subsequent video-frame callback.
          texture.needsUpdate = true;
          fit();
          notify();
          void playback();
        },
        { once: true },
      );
      element.src = source;
      element.load();
    } catch (e) {
      if (ticket !== generation) return;
      error = e.message;
      release();
      notify();
      onStatus(error);
    }
  }
  const visibility = () => void playback();
  document.addEventListener('visibilitychange', visibility);
  addEventListener('resize', fit);
  return {
    configure,
    play() {
      manualPlay = true;
      current.videoPaused = false;
      if (!video && current.background === 'video') {
        key = '';
        void configure(current, true);
      } else void playback();
    },
    pause() {
      current.videoPaused = true;
      video?.pause();
      onStatus('Vídeo pausado.');
    },
    state: () => ({
      type: current.background,
      ready: !!texture,
      video: !!video,
      paused: video?.paused ?? true,
      width: video?.videoWidth || 0,
      height: video?.videoHeight || 0,
      error,
    }),
    dispose() {
      ++generation;
      release();
      document.removeEventListener('visibilitychange', visibility);
      removeEventListener('resize', fit);
    },
  };
}
