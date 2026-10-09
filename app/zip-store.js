// ZIP sin compresión (método «store»): GLB, vídeos y JSON ya van comprimidos o son pequeños. Sin ZIP64 (< 4 GiB).
// createZip([{ name, data: Blob|string }]) → Blob; readZip(blob) → Map(nombre → Blob). Lee por trozos (Blob.slice).
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const UTF8_FLAG = 0x0800;
const DOS_DATE_1980 = 0x21;
const MAX_ZIP_BYTES = 0xffffffff;
const MAX_ENTRIES = 5000;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const safeName = name =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length < 256 &&
  !name.startsWith('/') &&
  !name.includes('\\') &&
  !name.split('/').includes('..');

function header(size, fields) {
  const view = new DataView(new ArrayBuffer(size));
  for (const [offset, bytes, value] of fields)
    bytes === 4 ? view.setUint32(offset, value, true) : view.setUint16(offset, value, true);
  return new Uint8Array(view.buffer);
}

export async function createZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    if (!safeName(name)) throw new Error(`Nombre de archivo no válido en la copia: ${name}`);
    const blob = data instanceof Blob ? data : new Blob([data]);
    const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
    const nameBytes = new TextEncoder().encode(name);
    const common = [
      [4, 2, 20],
      [6, 2, UTF8_FLAG],
      [10, 2, 0],
      [12, 2, DOS_DATE_1980],
    ];
    const local = header(30, [
      [0, 4, LOCAL],
      ...common,
      [14, 4, crc],
      [18, 4, blob.size],
      [22, 4, blob.size],
      [26, 2, nameBytes.length],
    ]);
    central.push(
      header(46, [
        [0, 4, CENTRAL],
        [4, 2, 20],
        ...common.map(([at, bytes, value]) => [at + 2, bytes, value]),
        [16, 4, crc],
        [20, 4, blob.size],
        [24, 4, blob.size],
        [28, 2, nameBytes.length],
        [42, 4, offset],
      ]),
      nameBytes,
    );
    parts.push(local, nameBytes, blob);
    offset += local.length + nameBytes.length + blob.size;
    if (offset > MAX_ZIP_BYTES) throw new Error('La copia supera 4 GiB; exporta menos archivos.');
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const count = entries.length;
  const end = header(22, [
    [0, 4, END],
    [8, 2, count],
    [10, 2, count],
    [12, 4, centralSize],
    [16, 4, offset],
  ]);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

const view = async (blob, start, length) => new DataView(await blob.slice(start, start + length).arrayBuffer());

export async function readZip(blob) {
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = await view(blob, tailStart, blob.size - tailStart);
  let at = tail.byteLength - 22;
  while (at >= 0 && tail.getUint32(at, true) !== END) at--;
  if (at < 0) throw new Error('El archivo no es una copia .zip válida.');
  const count = tail.getUint16(at + 10, true);
  const centralSize = tail.getUint32(at + 12, true);
  const centralOffset = tail.getUint32(at + 16, true);
  if (count > MAX_ENTRIES) throw new Error('La copia tiene demasiados archivos.');
  const central = await view(blob, centralOffset, centralSize);
  const files = new Map();
  for (let i = 0, p = 0; i < count; i++) {
    if (p + 46 > central.byteLength || central.getUint32(p, true) !== CENTRAL)
      throw new Error('El índice de la copia está dañado.');
    const method = central.getUint16(p + 10, true);
    const size = central.getUint32(p + 24, true);
    const nameLength = central.getUint16(p + 28, true);
    const skip = nameLength + central.getUint16(p + 30, true) + central.getUint16(p + 32, true);
    const localOffset = central.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(central.buffer, central.byteOffset + p + 46, nameLength));
    p += 46 + skip;
    if (method !== 0) throw new Error('La copia usa compresión; expórtala de nuevo desde Visión 3D.');
    if (!safeName(name)) throw new Error(`Nombre de archivo no válido en la copia: ${name}`);
    const local = await view(blob, localOffset, 30);
    if (local.getUint32(0, true) !== LOCAL) throw new Error('La copia está dañada.');
    const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    if (start + size > blob.size) throw new Error('La copia está incompleta.');
    files.set(name, blob.slice(start, start + size));
  }
  return files;
}
