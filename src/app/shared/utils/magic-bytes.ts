/** Assinatura PNG: 89 50 4E 47 0D 0A 1A 0A. */
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Assinatura JPEG (SOI + marker): FF D8 FF. */
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) {
    return false;
  }
  return sig.every((b, i) => bytes[i] === b);
}

/**
 * Identifica o tipo real da imagem pelos primeiros bytes (magic bytes),
 * ignorando o `file.type` declarado (forjável). Retorna o MIME reconhecido
 * ou `null` quando a assinatura não corresponde a PNG/JPEG.
 */
export function sniffImageMime(
  bytes: Uint8Array,
): 'image/png' | 'image/jpeg' | null {
  if (startsWith(bytes, PNG)) {
    return 'image/png';
  }
  if (startsWith(bytes, JPEG)) {
    return 'image/jpeg';
  }
  return null;
}
