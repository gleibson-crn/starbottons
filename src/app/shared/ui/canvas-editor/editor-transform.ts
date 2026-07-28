import type { BackgroundImageRef, EditorTransform, Framing } from '../../types';

export const SCALE_MIN = 0.2;
export const SCALE_MAX = 8;
export const ROT_MIN = -180;
export const ROT_MAX = 180;

/**
 * Referência de fundo ainda SEM posicionamento — os três campos de
 * enquadramento (`offset`/`scale`/`rotation`) são preenchidos com o neutro por
 * `withBackgroundImage`. Os call-sites (upload/galeria) só informam o essencial.
 */
export type BackgroundImageInput = Omit<
  BackgroundImageRef,
  'offset' | 'scale' | 'rotation'
> &
  Partial<Pick<BackgroundImageRef, 'offset' | 'scale' | 'rotation'>>;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Move um enquadramento por um delta em px de tela. Genérico sobre `Framing`:
 * serve tanto para a arte (`EditorTransform`) quanto para o fundo, preservando
 * quaisquer campos extras (cor, path da imagem, etc.).
 */
export function withOffset<T extends Framing>(t: T, dx: number, dy: number): T {
  return { ...t, offset: { x: t.offset.x + dx, y: t.offset.y + dy } };
}

/** Multiplica o zoom por um fator (clampeado). */
export function withZoom<T extends Framing>(t: T, factor: number): T {
  return { ...t, scale: clamp(t.scale * factor, SCALE_MIN, SCALE_MAX) };
}

/** Define o zoom por valor absoluto (slider). */
export function withScale<T extends Framing>(t: T, value: number): T {
  return { ...t, scale: clamp(value, SCALE_MIN, SCALE_MAX) };
}

/** Define a rotação absoluta em graus (clampeada a −180..180). */
export function withRotation<T extends Framing>(t: T, deg: number): T {
  return { ...t, rotation: clamp(deg, ROT_MIN, ROT_MAX) };
}

/** Aplica um delta de rotação em graus. */
export function withRotationDelta<T extends Framing>(t: T, delta: number): T {
  return withRotation(t, t.rotation + delta);
}

/** Troca a cor de fundo da área vazia. */
export function withBackground(
  t: EditorTransform,
  color: string,
): EditorTransform {
  return { ...t, background: color };
}

/**
 * Define a imagem de fundo (camada sob a arte). Se o `ref` não trouxer
 * posicionamento, inicializa o enquadramento neutro (centrado, cover, 0°).
 */
export function withBackgroundImage(
  t: EditorTransform,
  ref: BackgroundImageInput,
): EditorTransform {
  return {
    ...t,
    backgroundImage: {
      ...ref,
      offset: ref.offset ?? { x: 0, y: 0 },
      scale: ref.scale ?? 1,
      rotation: ref.rotation ?? 0,
    },
  };
}

/** Remove a imagem de fundo (volta a usar só a cor). */
export function clearBackgroundImage(t: EditorTransform): EditorTransform {
  return { ...t, backgroundImage: null };
}

/**
 * Redefine o enquadramento (posição/zoom/rotação) de uma camada para o neutro,
 * preservando quaisquer campos extras. Para a arte (`EditorTransform`) isso
 * mantém a COR (`background`) e a IMAGEM (`backgroundImage`) — que são fundo,
 * não enquadramento. Para o fundo, zera offset/scale/rotation.
 */
export function resetTransform<T extends Framing>(t: T): T {
  return { ...t, offset: { x: 0, y: 0 }, scale: 1, rotation: 0 };
}
