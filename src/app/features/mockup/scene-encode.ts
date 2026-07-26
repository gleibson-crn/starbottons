/** Resultado da recodificação da cena (WebP, sem EXIF). */
export interface EncodedScene {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

/** Maior lado permitido para a cena persistida. */
export const MAX_SCENE_SIDE = 2000;
/** Qualidade WebP alvo. */
export const SCENE_QUALITY = 0.82;

function targetDims(
  w: number,
  h: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao codificar a cena.'))),
      'image/webp',
      quality,
    );
  });
}

/**
 * Recodifica a cena como WebP com downscale ao maior lado ≤ 2000px. O
 * re-encode via canvas DESCARTA metadados EXIF/GPS da foto original (privacidade
 * — fotos podem conter localização). Devolve blob + dimensões finais.
 */
export async function encodeScene(
  image: HTMLImageElement,
  maxSide: number = MAX_SCENE_SIDE,
  quality: number = SCENE_QUALITY,
): Promise<EncodedScene> {
  const src = { w: image.naturalWidth || image.width, h: image.naturalHeight || image.height };
  const { width, height } = targetDims(src.w, src.h, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível.');
  }
  ctx.drawImage(image, 0, 0, width, height);
  return { blob: await toBlob(canvas, quality), width, height };
}
