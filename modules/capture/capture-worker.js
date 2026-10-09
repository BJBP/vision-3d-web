// Web Worker de seguimiento: carga los modelos de MediaPipe (pose y gestos) y, por cada
// fotograma recibido, responde con un paquete normalizado ({type: "packet"}) o un error.
import { FilesetResolver, PoseLandmarker, GestureRecognizer } from '../../lib/mediapipe/vision_bundle.mjs';
import ModuleFactory from '../../lib/mediapipe/wasm/vision_wasm_module_internal.js';
import { normalizeCapture } from './capture-normalize.js';

let pose,
  hands,
  canvas,
  context,
  lastTimestamp = -1;
self.onmessage = async ({ data }) => {
  const { bitmap } = data;
  try {
    if (data.type === 'init') {
      if (!(await FilesetResolver.isSimdSupported()))
        throw new Error('El navegador necesita WebAssembly SIMD para el seguimiento. Actualiza Chrome o Edge.');
      const files = await FilesetResolver.forVisionTasks(
        new URL('../../lib/mediapipe/wasm', import.meta.url).href,
        true,
      );
      self.ModuleFactory = ModuleFactory;
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL('../../models/pose_landmarker_lite.task', import.meta.url).href,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      // MediaPipe clears its factory after each task; ESM imports run only once.
      self.ModuleFactory = ModuleFactory;
      hands = await GestureRecognizer.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL('../../models/gesture_recognizer.task', import.meta.url).href,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      canvas = new OffscreenCanvas(1, 1);
      context = canvas.getContext('2d');
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      context.drawImage(bitmap, 0, 0);
      const timestamp = Math.max(lastTimestamp + 1, data.timestamp);
      lastTimestamp = timestamp;
      const body = pose.detectForVideo(canvas, timestamp);
      const fingers = hands.recognizeForVideo(canvas, timestamp);
      self.postMessage({ type: 'packet', packet: normalizeCapture(body, fingers, timestamp, data.fps) });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  } finally {
    bitmap?.close();
  }
};
