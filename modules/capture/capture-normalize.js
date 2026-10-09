// Convierte los resultados de MediaPipe (pose y manos) al paquete de captura común
// que consume app.js, el mismo formato que envía el servidor de la OAK-D.
const round = (value, digits) => Number(Number(value).toFixed(digits));
const world = points => (points?.length ? points.flatMap(p => [p.x, p.y, p.z].map(v => round(v, 4))) : null);
const image = points => points.flatMap(p => [round(1 - p.x, 3), round(p.y, 3)]);

// Keep the OAK packet schema; monocular landmarks do not measure distance.
export function normalizeCapture(poseResult = {}, handResult = {}, timestamp = 0, fps = 0) {
  const body = poseResult.landmarks?.[0];
  const hands = (handResult.landmarks || []).map((points, index) => {
    const palm = [0, 5, 9, 13, 17].reduce((sum, i) => ({ x: sum.x + points[i].x / 5, y: sum.y + points[i].y / 5 }), {
      x: 0,
      y: 0,
    });
    const distance = i => Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    const size = distance(9) + 1e-6;
    const gesture = handResult.gestures?.[index]?.[0];
    return {
      x: round(1 - palm.x, 4),
      y: round(palm.y, 4),
      z: null,
      g: gesture?.categoryName || 'None',
      s: round(gesture?.score || 0, 2),
      o: round([8, 12, 16, 20].reduce((sum, i) => sum + distance(i), 0) / 4 / size, 2),
      sz: round(size, 4),
      lm: image(points),
      wl: world(handResult.worldLandmarks?.[index]),
    };
  });
  return {
    cam: true,
    camera_state: 'streaming',
    t: timestamp,
    fps: round(fps, 1),
    hands,
    pose: body?.length
      ? {
          w: world(poseResult.worldLandmarks?.[0]),
          i: image(body),
          v: body.map(p => round(p.visibility ?? 1, 2)),
          d: null,
        }
      : null,
  };
}
