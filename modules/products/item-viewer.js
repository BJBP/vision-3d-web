// Muestra el elemento elegido según su tipo: modelo integrado o GLB (en el mundo 3D, con su animación), vídeo (en el
// visor) o avatar (lo pinta app.js), y reproduce su sonido si tiene; al cerrarlo, para animación y sonido. createItemViewer({ viewport, world, onStatus, onReady }) → { show, hide, playing }.
export function createItemViewer({ viewport, world, onStatus = () => {}, onReady = () => {} }) {
  let video = null;
  let sound = null;
  let token = 0;

  function stopSound() {
    if (!sound) return;
    sound.pause();
    sound.removeAttribute('src');
    sound.load();
    sound = null;
  }

  // Los navegadores solo dejan sonar audio tras un toque o clic en la página; si aún no lo hubo, no suena.
  function playSound(item) {
    sound = new Audio(item.sound);
    sound.play().catch(error => console.info(`El sonido de «${item.name}» no sonó:`, error.message || error));
  }

  function hideVideo() {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    video = null;
  }

  function showVideo(item) {
    video = document.createElement('video');
    video.className = 'product-video';
    video.src = item.src;
    video.controls = true;
    video.playsInline = true;
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.setAttribute('aria-label', item.name);
    video.addEventListener('error', () => onStatus(`No se pudo reproducir «${item.name}». Comprueba el archivo.`));
    viewport.append(video);
    video.play().catch(() => onStatus('Pulsa ▶ para reproducir el vídeo.'));
  }

  async function showFile(item, current) {
    onStatus(`Cargando «${item.name}»…`);
    try {
      await world.loadModel(item.src, item.name);
      if (current === token) {
        world.select(item.src, { animation: item.animation });
        onStatus('');
        onReady();
      }
    } catch (error) {
      if (current === token) onStatus(`No se pudo cargar «${item.name}»: ${error.message}`);
    }
  }

  return {
    show(item) {
      const current = ++token;
      hideVideo();
      stopSound();
      onStatus('');
      if (item.sound) playSound(item);
      if (item.type === 'video') showVideo(item);
      else if (item.type === 'model' && item.model) world.select(item.model, { animation: false });
      else if (item.type === 'model' && item.src) void showFile(item, current);
    },
    hide() {
      token++;
      hideVideo();
      stopSound();
      world.stopAnimation?.();
    },
    playing: () => Boolean(video && !video.paused && !video.ended),
  };
}
