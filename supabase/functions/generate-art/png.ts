/**
 * Marca a densidade física (pHYs) num PNG para que o arquivo declare a DPI real.
 * resvg emite PNG sem pHYs; sem esse chunk a gráfica não sabe que é 300 DPI.
 *
 * pHYs: 4 bytes ppuX + 4 bytes ppuY + 1 byte unidade (1 = metro).
 * pixels-por-metro = round(dpi / 0.0254).
 */

const PNG_SIGNATURE_LEN = 8;
const LENGTH_FIELD_LEN = 4;
const TYPE_FIELD_LEN = 4;

/** CRC-32 (polinômio PNG) sobre type+data, como exige a spec. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Constrói um chunk pHYs completo (length+type+data+crc) para a DPI dada. */
function buildPhysChunk(dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21); // 4 len + 4 type + 9 data + 4 crc
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9); // data length
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm); // ppuX
  view.setUint32(12, ppm); // ppuY
  chunk[16] = 1; // unit = meter
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/** Insere/atualiza o pHYs logo após o IHDR. Assume IHDR como 1º chunk. */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ihdrLen = new DataView(png.buffer, png.byteOffset).getUint32(
    PNG_SIGNATURE_LEN,
  );
  const ihdrEnd = PNG_SIGNATURE_LEN + LENGTH_FIELD_LEN + TYPE_FIELD_LEN +
    ihdrLen + 4;
  const phys = buildPhysChunk(dpi);
  const out = new Uint8Array(png.length + phys.length);
  out.set(png.subarray(0, ihdrEnd), 0);
  out.set(phys, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + phys.length);
  return out;
}
