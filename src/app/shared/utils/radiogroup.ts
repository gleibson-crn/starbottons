/** Teclas que movem o foco/seleção dentro de um radiogroup. */
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Calcula o próximo índice habilitado num radiogroup em resposta a uma tecla
 * de seta (WCAG 2.1.1 / padrão ARIA radio). Pula itens desabilitados e faz
 * wrap-around. Retorna o índice atual quando a tecla não é de navegação ou
 * não há outro item habilitável.
 */
export function rovingNext(
  count: number,
  current: number,
  key: string,
  isEnabled: (index: number) => boolean,
): number {
  const delta = NEXT_KEYS.has(key) ? 1 : PREV_KEYS.has(key) ? -1 : 0;
  if (delta === 0 || count === 0) {
    return current;
  }
  let idx = current;
  for (let step = 0; step < count; step++) {
    idx = (idx + delta + count) % count;
    if (isEnabled(idx)) {
      return idx;
    }
  }
  return current;
}
