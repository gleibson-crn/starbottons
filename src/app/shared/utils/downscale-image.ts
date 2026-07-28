import { loadImage } from './image';

/**
 * Lado máximo (px) padrão para imagens de FUNDO do botton. A maior arte é 827px
 * (58mm @ 300 DPI), então ~1000px cobre com folga — guardar/decodificar fotos
 * maiores (ex.: 1920px) só desperdiça banda e, principalmente, estoura o limite
 * de CPU do worker da Edge ao decodificar por tamanho. Reduzir no upload mantém
 * a qualidade de impressão e a geração dentro do orçamento de CPU.
 */
export const BACKGROUND_MAX_DIM = 1000;

/**
 * Reduz um arquivo de imagem para caber em `maxDim` (maior lado), preservando a
 * proporção e o formato (PNG→PNG, JPEG→JPEG). Se já couber, devolve o arquivo
 * original inalterado. Reencoda via canvas (JPEG a 0.9). Não faz upscale.
 */
export async function downscaleImageFile(
  file: File,
  maxDim: number = BACKGROUND_MAX_DIM,
): Promise<File> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // Ambiente sem canvas 2D (ex.: jsdom nos testes) — não dá para redimensionar;
  // sobe o arquivo original. Também evita chamar loadImage (que não resolve lá).
  if (!ctx) {
    return file;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest || longest <= maxDim) {
      return file;
    }
    const scale = maxDim / longest;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.9),
    );
    return blob ? new File([blob], file.name, { type }) : file;
  } catch {
    // Qualquer falha ao decodificar/redimensionar → sobe o original (a Edge lida).
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
