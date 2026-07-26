import { safeFileName } from '../../shared/utils';
import { MODEL_LABEL } from './batch.constants';
import type { BottonSize } from './batch.types';

/** Extensões de artefato baixável. */
export type ArtExt = 'png' | 'pdf';

/** `true` se o nome dado pelo usuário é preenchível (não vazio após trim). */
export function isNameValid(name: string): boolean {
  return name.trim().length > 0;
}

/**
 * Base do nome do arquivo: `{nome}-{modelo}-{tamanho}mm`. O nome é sanitizado
 * por `safeFileName` (preserva letras/números/hífen); modelo é "redondo".
 * Ex.: `nomeDaImagem-redondo-32mm`.
 */
export function artFileBase(name: string, size: BottonSize): string {
  return `${safeFileName(name.trim())}-${MODEL_LABEL}-${size}mm`;
}

/** Nome completo de arquivo (`base.ext`) para download individual. */
export function artFileName(name: string, size: BottonSize, ext: ArtExt): string {
  return `${artFileBase(name, size)}.${ext}`;
}

/**
 * Resolve colisões dentro do ZIP: se `base.ext` já existe, tenta `base-2.ext`,
 * `base-3.ext`… Registra o nome escolhido em `used`.
 */
export function uniqueFileName(
  base: string,
  ext: ArtExt,
  used: Set<string>,
): string {
  let candidate = `${base}.${ext}`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}.${ext}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}
