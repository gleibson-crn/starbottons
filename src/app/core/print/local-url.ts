/**
 * Baixa uma URL (tipicamente uma SIGNED URL cross-origin do Storage) e devolve
 * um OBJECT URL de mesma origem (`blob:`). O documento de impressão do
 * navegador não carrega signed URLs de forma confiável (expiram / bloqueio
 * cross-origin), saindo em branco; o object URL imprime de forma estável e não
 * expira. Quem chama é dono do object URL e deve revogá-lo (a `PrintStore`
 * revoga ao remover/limpar). Função pura de I/O, sem Angular nem DOM.
 */
export async function toLocalUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${res.status}`);
  }
  return URL.createObjectURL(await res.blob());
}
