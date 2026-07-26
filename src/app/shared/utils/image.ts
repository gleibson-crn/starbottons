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

/** Slug seguro para nome de arquivo em storage (sem espaços/acentos). */
export function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(-80);
}
