// Convierte los resultados de MediaPipe (pose y manos) al paquete de captura común
// que consume app.js, el mismo formato que envía el servidor de la OAK-D.
const round = (value, digits) => Number(Number(value).toFixed(digits));
const world = points => (points?.length ? points.flatMap(p => [p.x, p.y, p.z].map(v => round(v, 4))) : null);
const fullZone = { x: 0, y: 0, width: 1, height: 1 };

// Zones use the mirrored preview coordinates; inference crops the opposite camera side.
export function captureOptions(options = {}) {
  const maxParticipants = options.maxParticipants ?? 2;
  const zone = options.participationZone ?? fullZone;
  if (!Number.isInteger(maxParticipants) || maxParticipants < 1 || maxParticipants > 4)
    throw new RangeError('Elige entre uno y cuatro participantes.');
  if (
    !zone ||
    typeof zone !== 'object' ||
    !['x', 'y', 'width', 'height'].every(key => Number.isFinite(zone[key])) ||
    zone.x < 0 ||
    zone.y < 0 ||
    zone.width <= 0 ||
    zone.height <= 0 ||
    zone.x + zone.width > 1.000001 ||
    zone.y + zone.height > 1.000001
  )
    throw new RangeError('La zona de participación debe quedar dentro de la cámara.');
  return { maxParticipants, participationZone: { ...zone } };
}
const coordinates = (point, zone) => ({
  x: zone.x + (1 - point.x) * zone.width,
  y: zone.y + point.y * zone.height,
});
const image = (points, zone) =>
  points.flatMap(p => {
    const { x, y } = coordinates(p, zone);
    return [round(x, 3), round(y, 3)];
  });

// Keep the OAK packet schema; monocular landmarks do not measure distance.
export function normalizeCapture(poseResult = {}, handResult = {}, timestamp = 0, fps = 0, zone = fullZone) {
  const poses = (poseResult.landmarks || [])
    .map((body, index) =>
      body?.length
        ? {
            w: world(poseResult.worldLandmarks?.[index]),
            i: image(body, zone),
            v: body.map(p => round(p.visibility ?? 1, 2)),
            d: null,
          }
        : null,
    )
    .filter(Boolean);
  const hands = (handResult.landmarks || []).map((points, index) => {
    const fullPoints = points.map(point => coordinates(point, zone));
    const palm = [0, 5, 9, 13, 17].reduce(
      (sum, i) => ({ x: sum.x + fullPoints[i].x / 5, y: sum.y + fullPoints[i].y / 5 }),
      {
        x: 0,
        y: 0,
      },
    );
    const distance = i => Math.hypot(fullPoints[i].x - fullPoints[0].x, fullPoints[i].y - fullPoints[0].y);
    const size = distance(9) + 1e-6;
    const gesture = handResult.gestures?.[index]?.[0];
    return {
      x: round(palm.x, 4),
      y: round(palm.y, 4),
      z: null,
      g: gesture?.categoryName || 'None',
      s: round(gesture?.score || 0, 2),
      o: round([8, 12, 16, 20].reduce((sum, i) => sum + distance(i), 0) / 4 / size, 2),
      sz: round(size, 4),
      lm: image(points, zone),
      wl: world(handResult.worldLandmarks?.[index]),
    };
  });
  return {
    cam: true,
    camera_state: 'streaming',
    t: timestamp,
    fps: round(fps, 1),
    hands,
    poses,
    pose: poses[0] || null,
  };
}
