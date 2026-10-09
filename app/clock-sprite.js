// Holograma del reloj que aparece al levantar la muñeca para mirar la hora.
// createClockSprite({ scene, color }) devuelve el sprite y draw(), que pinta la hora actual.
import * as THREE from 'three';

export function createClockSprite({ scene, color }) {
  const clockCv = document.createElement('canvas');
  clockCv.width = clockCv.height = 512;
  const clockTex = new THREE.CanvasTexture(clockCv);
  const clockSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: clockTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  scene.add(clockSprite);
  function drawClock() {
    const g = clockCv.getContext('2d'),
      C = 256,
      now = new Date();
    const mg = `#${color.getHexString()}`;
    g.clearRect(0, 0, 512, 512);
    g.lineCap = 'round';
    g.shadowColor = mg;
    g.shadowBlur = 18;
    g.strokeStyle = 'rgba(220,235,245,0.95)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(C, C, 200, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = mg;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(C, C, 226, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2,
        big = k % 5 === 0;
      g.strokeStyle = big ? '#ffffff' : 'rgba(200,230,215,0.6)';
      g.lineWidth = big ? 7 : 2;
      g.beginPath();
      g.moveTo(C + Math.sin(a) * (big ? 160 : 176), C - Math.cos(a) * (big ? 160 : 176));
      g.lineTo(C + Math.sin(a) * 188, C - Math.cos(a) * 188);
      g.stroke();
    }
    const sec = now.getSeconds() + now.getMilliseconds() / 1000,
      min = now.getMinutes() + sec / 60,
      hr = (now.getHours() % 12) + min / 60;
    const hand = (a, len, w, col) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(C - Math.sin(a) * 20, C + Math.cos(a) * 20);
      g.lineTo(C + Math.sin(a) * len, C - Math.cos(a) * len);
      g.stroke();
    };
    hand((hr / 12) * Math.PI * 2, 100, 12, '#ffffff');
    hand((min / 60) * Math.PI * 2, 150, 8, '#e8f2f8');
    hand((sec / 60) * Math.PI * 2, 170, 3, mg);
    g.fillStyle = mg;
    g.beginPath();
    g.arc(C, C, 9, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 12;
    g.fillStyle = '#ffffff';
    g.font = `300 44px "Ubuntu", "Inter", sans-serif`;
    g.textAlign = 'center';
    g.fillText(now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }), C, C + 110);
    clockTex.needsUpdate = true;
  }
  return { sprite: clockSprite, draw: drawClock };
}
