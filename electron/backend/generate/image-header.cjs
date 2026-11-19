/**
 * Validação defensiva da imagem de origem ANTES de decodificar o bitmap
 * (porte fiel de generate-art/image-header.ts).
 *
 * Confirma magic bytes reais (PNG/JPEG) e lê largura×altura do HEADER,
 * rejeitando >24MP sem alocar o bitmap (anti decode-bomb / OOM).
 */

const { ArtError } = require('./art-error.cjs');

/** Teto anti-DoS: ~24 megapixels. */
const MAX_SOURCE_PIXELS = 24_000_000;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

/** `bytes` começa com a sequência `sig`? */
function startsWith(bytes, sig) {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

/** Dimensões do PNG a partir do IHDR (width @16-19, height @20-23, big-endian). */
function pngDimensions(bytes) {
  if (bytes.length < 24) throw new ArtError(400, 'PNG truncado');
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Marcador SOF (contém dimensões)? Exclui DHT/JPG/DAC. */
function isSofMarker(marker) {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

/** Percorre os segmentos JPEG até o SOF e lê height/width (big-endian). */
function jpegDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  let offset = 2; // pula SOI (FF D8)
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (isSofMarker(marker)) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + view.getUint16(offset + 2); // pula o segmento
  }
  throw new ArtError(400, 'JPEG sem marcador SOF');
}

/**
 * Valida assinatura + dimensões do header e aplica o teto de megapixels.
 * Lança 400 (assinatura/estrutura inválida) ou 422 (excede o teto).
 */
function assertSafeSource(bytes) {
  const isPng = startsWith(bytes, PNG_MAGIC);
  const isJpeg = startsWith(bytes, JPEG_MAGIC);
  if (!isPng && !isJpeg) {
    throw new ArtError(400, 'assinatura inválida (só PNG/JPEG)');
  }
  const mime = isPng ? 'image/png' : 'image/jpeg';
  const { width, height } = isPng ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (!width || !height) {
    throw new ArtError(400, 'dimensões inválidas no header');
  }
  if (width * height > MAX_SOURCE_PIXELS) {
    throw new ArtError(422, `imagem excede ${MAX_SOURCE_PIXELS / 1_000_000}MP`);
  }
  return { mime, width, height };
}

module.exports = { MAX_SOURCE_PIXELS, assertSafeSource };
