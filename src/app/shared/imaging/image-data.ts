/**
 * makeImageData — cria um `ImageData` usando o construtor nativo quando
 * disponível (navegador/worker) e caindo para um objeto estrutural equivalente
 * quando não (ambiente de teste jsdom, que não implementa `ImageData`). Mantém
 * as funções puras de `shared/imaging` testáveis sem polyfill e corretas em
 * produção (o `ctx.putImageData` recebe um `ImageData` real no browser).
 */
export function makeImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  if (typeof ImageData !== 'undefined') {
    // Cast do construtor: em TS 5.7+ os typed arrays são genéricos sobre o
    // buffer (ArrayBufferLike vs ArrayBuffer), o que quebra o overload nativo.
    const Ctor = ImageData as unknown as new (
      d: Uint8ClampedArray,
      w: number,
      h: number,
    ) => ImageData;
    return new Ctor(data, width, height);
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
}
