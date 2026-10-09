// Renderer WebGL, escena, cámara y cadena de postprocesado (estela + bloom).
// createSceneSetup({ quality, trails }) devuelve los objetos; app.js los configura después.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createSceneSetup({ quality, trails }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.5));
  renderer.setClearColor(0x000000, 1);
  renderer.info.autoReset = false;
  renderer.domElement.setAttribute('aria-label', 'Avatar humano tridimensional de Hardtech');
  renderer.setSize(innerWidth, innerHeight);
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 8.6);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const afterimage = new AfterimagePass(0.42);
  afterimage.enabled = trails;
  composer.addPass(afterimage);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.4, 0.45, 0.65);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return { renderer, scene, camera, composer, afterimage, bloom };
}
