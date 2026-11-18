import type {
  BackgroundImageRef,
  EditorTransform,
  FrameImageRef,
  Framing,
} from '../../types';

export const SCALE_MIN = 0.2;
export const SCALE_MAX = 8;
export const ROT_MIN = -180;
export const ROT_MAX = 180;

/** Máximo de molduras EMPILHADAS por botton (decisão travada). */
export const MAX_FRAMES = 3;

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

/**
 * Referência de moldura ainda SEM posicionamento — o enquadramento é
 * inicializado no neutro (COVER) por `addFrameImage`. Espelha
 * `BackgroundImageInput`: os call-sites (upload/galeria) só informam o essencial.
 */
export type FrameImageInput = Omit<
  FrameImageRef,
  'offset' | 'scale' | 'rotation'
> &
  Partial<Pick<FrameImageRef, 'offset' | 'scale' | 'rotation'>>;

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
 * Empilha uma MOLDURA no topo (última do array = z-order mais alto). Nasce em
 * COVER (offset {0,0}, scale 1, 0°) salvo enquadramento explícito. Respeita o
 * teto `max` (default `MAX_FRAMES`=3): se já atingiu, é NO-OP (devolve o mesmo transform) — o
 * chamador deve checar `canAddFrame` para dar feedback ao usuário.
 */
export function addFrameImage(
  t: EditorTransform,
  ref: FrameImageInput,
  max = MAX_FRAMES,
): EditorTransform {
  if (t.frameImages.length >= max) {
    return t;
  }
  const frame: FrameImageRef = {
    ...ref,
    offset: ref.offset ?? { x: 0, y: 0 },
    scale: ref.scale ?? 1,
    rotation: ref.rotation ?? 0,
  };
  return { ...t, frameImages: [...t.frameImages, frame] };
}

/** `true` quando ainda cabe empilhar outra moldura (< `MAX_FRAMES`). */
export function canAddFrame(t: EditorTransform, max = MAX_FRAMES): boolean {
  return t.frameImages.length < max;
}

/** Remove a moldura no índice `index` (no-op se fora da faixa). */
export function removeFrameImageAt(
  t: EditorTransform,
  index: number,
): EditorTransform {
  if (index < 0 || index >= t.frameImages.length) {
    return t;
  }
  return { ...t, frameImages: t.frameImages.filter((_, i) => i !== index) };
}

/**
 * Move a moldura de `from` para `to` (reordena o z-order). No-op se os índices
 * forem iguais ou fora da faixa. Preserva as demais na ordem relativa.
 */
export function reorderFrame(
  t: EditorTransform,
  from: number,
  to: number,
): EditorTransform {
  const n = t.frameImages.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) {
    return t;
  }
  const next = [...t.frameImages];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...t, frameImages: next };
}

/** Atualiza SÓ o enquadramento (offset/scale/rotation) da moldura em `index`. */
export function updateFrameFramingAt(
  t: EditorTransform,
  index: number,
  framing: Framing,
): EditorTransform {
  if (index < 0 || index >= t.frameImages.length) {
    return t;
  }
  const next = t.frameImages.map((f, i) =>
    i === index
      ? { ...f, offset: framing.offset, scale: framing.scale, rotation: framing.rotation }
      : f,
  );
  return { ...t, frameImages: next };
}

/**
 * Redefine o enquadramento (posição/zoom/rotação) de uma camada para o neutro,
 * preservando quaisquer campos extras. Para a arte (`EditorTransform`) isso
 * mantém a COR (`background`) e a IMAGEM (`backgroundImage`) — que são fundo,
 * não enquadramento. Para o fundo, zera offset/scale/rotation.
 */
export function resetTransform<T extends Framing>(t: T): T {
  const base = { ...t, offset: { x: 0, y: 0 }, scale: 1, rotation: 0 };
  // Limpa o espelhamento só quando o objeto é uma arte (EditorTransform).
  return 'flipH' in t || 'flipV' in t ? { ...base, flipH: false, flipV: false } : base;
}

/** Inverte o espelhamento horizontal da arte. */
export function toggleFlipH(t: EditorTransform): EditorTransform {
  return { ...t, flipH: !(t.flipH ?? false) };
}

/** Inverte o espelhamento vertical da arte. */
export function toggleFlipV(t: EditorTransform): EditorTransform {
  return { ...t, flipV: !(t.flipV ?? false) };
}
