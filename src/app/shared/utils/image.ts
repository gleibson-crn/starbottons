/** Carrega uma imagem a partir de uma URL, resolvendo quando pronta. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error('Falha ao carregar a imagem.'));
    img.src = url;
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
