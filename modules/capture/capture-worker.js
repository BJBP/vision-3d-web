// Capture worker: crop the participation zone, track multiple bodies/hands,
// and emit full-image mirrored landmarks with unchanged world coordinates.
import { FilesetResolver, PoseLandmarker, GestureRecognizer } from '../../lib/mediapipe/vision_bundle.mjs';
import ModuleFactory from '../../lib/mediapipe/wasm/vision_wasm_module_internal.js';
import { normalizeCapture, captureOptions } from './capture-normalize.js';

let pose,
  hands,
  canvas,
  context,
  lastTimestamp = -1;
let options = captureOptions();
let queue = Promise.resolve();

async function initialize(data) {
  options = captureOptions(data.options);
  if (!(await FilesetResolver.isSimdSupported()))
    throw new Error('El navegador necesita WebAssembly SIMD para el seguimiento. Actualiza Chrome o Edge.');
  const files = await FilesetResolver.forVisionTasks(new URL('../../lib/mediapipe/wasm', import.meta.url).href, true);
  self.ModuleFactory = ModuleFactory;
  pose = await PoseLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: new URL('../../models/pose_landmarker_lite.task', import.meta.url).href,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numPoses: options.maxParticipants,
  });
  // MediaPipe clears its factory after each task; ESM imports run only once.
  self.ModuleFactory = ModuleFactory;
  hands = await GestureRecognizer.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: new URL('../../models/gesture_recognizer.task', import.meta.url).href,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numHands: 2 * options.maxParticipants,
  });
  canvas = new OffscreenCanvas(1, 1);
  context = canvas.getContext('2d');
  self.postMessage({ type: 'ready' });
}

async function processMessage(data) {
  const { bitmap } = data;
  try {
    if (data.type === 'init') await initialize(data);
    else if (data.type === 'configure') {
      const next = captureOptions(data.options);
      if (next.maxParticipants !== options.maxParticipants) {
        await pose.setOptions({ numPoses: next.maxParticipants });
        await hands.setOptions({ numHands: 2 * next.maxParticipants });
      }
      options = next;
      self.postMessage({ type: 'configured', id: data.id });
    } else if (data.type === 'frame') {
      const zone = options.participationZone;
      const sx = (1 - zone.x - zone.width) * bitmap.width;
      const sy = zone.y * bitmap.height;
      const width = zone.width * bitmap.width,
        height = zone.height * bitmap.height;
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      context.drawImage(bitmap, sx, sy, width, height, 0, 0, canvas.width, canvas.height);
      const timestamp = Math.max(lastTimestamp + 1, data.timestamp);
      lastTimestamp = timestamp;
      const body = pose.detectForVideo(canvas, timestamp);
      const fingers = hands.recognizeForVideo(canvas, timestamp);
      self.postMessage({ type: 'packet', packet: normalizeCapture(body, fingers, timestamp, data.fps, zone) });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  } finally {
    bitmap?.close();
  }
}
// Model configuration is asynchronous; serialize it with frames and initial model loading.
self.onmessage = ({ data }) => {
  queue = queue.then(() => processMessage(data));
};
