/**
 * Carrega uma imagem a partir de uma URL, resolvendo quando pronta.
 *
 * Para URLs remotas (http/https — ex.: cena vinda de uma signed URL do
 * Storage) marcamos `crossOrigin='anonymous'` para que o canvas NÃO fique
 * "tainted" e a composição possa ser exportada via `toBlob`/`toDataURL`
 * (o Storage responde com `Access-Control-Allow-Origin`). URLs `blob:`/`data:`
 * são same-origin e ignoram o atributo.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    if (/^https?:/i.test(url)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error('Falha ao carregar a imagem.'));
    img.src = url;
  });
}

/**
 * Rasteriza um `HTMLImageElement` num PNG lossless (via canvas). Usado, por ex.,
 * para obter o Blob da foto ORIGINAL antes de enviá-la a um serviço de estilo
 * por IA (Trilha 2, ADR-021).
 *
 * `maxSide` (opcional): se informado e a imagem exceder esse lado maior, REDUZ
 * proporcionalmente antes de rasterizar. Essencial para o envio à IA — os
 * modelos de imagem (gpt-image) devolvem no máximo ~1536px, então mandar a foto
 * full-res (12–24MP) só infla payload/upload/tempo, SEM ganho de qualidade, e
 * pode estourar o orçamento de tempo da Edge. Sem `maxSide`, mantém o full-res.
 */
export async function imageElementToPngBlob(
  img: HTMLImageElement,
  maxSide?: number,
): Promise<Blob> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  // Fator de redução ≤ 1 (só encolhe; nunca amplia).
  const scale = maxSide && maxSide > 0 ? Math.min(1, maxSide / Math.max(w, h)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível para preparar a imagem.');
  }
  // Reamostragem de boa qualidade ao reduzir.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao ler a imagem.'))),
      'image/png',
    );
  });
}

/**
 * Gera um PNG 1×1 transparente em memória (via canvas). Payload MÍNIMO para
 * uma "probe" barata a um serviço externo de IA — ex.: descobrir, ao abrir o
 * diálogo, se a conta de IA está sem créditos, sem enviar a arte real do
 * usuário. Não toca em rede; o Blob resultante é minúsculo.
 */
export async function onePixelPngBlob(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível para gerar a imagem de teste.');
  }
  ctx.clearRect(0, 0, 1, 1);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG de teste.'))),
      'image/png',
    );
  });
}

/** Slug seguro para nome de arquivo em storage (sem espaços/acentos). */
export function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(-80);
}
