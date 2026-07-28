import type { BackgroundImageRef, Framing } from '../../shared/types';

/**
 * Enquadramento (Framing: offset/scale/rotation) da imagem de FUNDO do botton, a
 * partir da sua referência no `EditorTransform`. `null` quando o botton não tem
 * imagem de fundo. Alimenta o sprite fiel do Mockup Contextual (ADR-017).
 */
export function bgFraming(ref: BackgroundImageRef | null): Framing | null {
  return ref
    ? { offset: ref.offset, scale: ref.scale, rotation: ref.rotation }
    : null;
}
