/**
 * Transformação de enquadramento aplicada pela imagem no editor.
 * Este mesmo objeto é serializado em `options` da Edge Function `generate-art`,
 * garantindo que preview (Angular) e arte final (server) usem o MESMO ajuste.
 */
/**
 * Referência a uma imagem de fundo do botton (camada sob a arte do usuário).
 * O mesmo objeto é usado pelo preview (via `url`, um object URL) e pela Edge
 * (via `path`, o caminho no Storage). Estágio 2: só `source: 'upload'`;
 * `template` (com `id`) fica preparado para o próximo passo.
 */
export interface BackgroundImageRef {
  /** Caminho no Storage bucket `uploads`. */
  readonly path: string;
  /** URL para preview (object URL do upload). */
  readonly url: string;
  /** Origem da imagem de fundo. */
  readonly source: 'upload' | 'template';
  /** Id do template (futuro; ausente em uploads). */
  readonly id?: string;
}

export interface EditorTransform {
  /** Deslocamento do centro da imagem, em px de tela do editor. */
  readonly offset: { x: number; y: number };
  /** Fator de zoom (1 = "cover" exato da arte). */
  readonly scale: number;
  /** Rotação livre em graus (−180..+180). */
  readonly rotation: number;
  /** Cor sólida de fundo para área vazia (hex, default branco). */
  readonly background: string;
  /**
   * Imagem de fundo (por cima da cor, por baixo da arte). `null` = usar só a
   * cor `background`. Preenche o círculo em COVER fixo (sem o transform do
   * usuário).
   */
  readonly backgroundImage: BackgroundImageRef | null;
}

/** Estado default seguro do editor (sem ajuste, fundo branco, sem imagem). */
export const DEFAULT_TRANSFORM: EditorTransform = {
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
  background: '#ffffff',
  backgroundImage: null,
};

/** Faixa de gating de resolução do editor (semáforo). */
export type ResolutionTier = 'ok' | 'warn' | 'blocked';

/** Efeito de "look" mutuamente exclusivo aplicado sobre a imagem. */
export type ImageEffect = 'none' | 'grayscale' | 'sepia';

/**
 * Tratamento/filtros de imagem aplicados no editor. Independente do
 * enquadramento (`EditorTransform`): `brightness`/`contrast`/`saturate` são
 * fatores multiplicativos (1 = neutro) e `effect` é um look exclusivo. O MESMO
 * objeto alimenta o preview (canvas) e o processamento full-res na geração.
 */
export interface ImageFilters {
  /** Brilho (0.5–1.5; 1 = neutro). */
  readonly brightness: number;
  /** Contraste (0.5–1.5; 1 = neutro). */
  readonly contrast: number;
  /** Saturação (0.5–1.5; 1 = neutro). */
  readonly saturate: number;
  /** Look exclusivo aplicado por cima dos ajustes. */
  readonly effect: ImageEffect;
}

/** Estado neutro (nenhum filtro): render idêntico ao original. */
export const DEFAULT_FILTERS: ImageFilters = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  effect: 'none',
};

/** `true` quando dois conjuntos de filtros são equivalentes. */
export function filtersEqual(a: ImageFilters, b: ImageFilters): boolean {
  return (
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.saturate === b.saturate &&
    a.effect === b.effect
  );
}

/** `true` quando os filtros estão no estado neutro (nenhum tratamento). */
export function isDefaultFilters(f: ImageFilters): boolean {
  return filtersEqual(f, DEFAULT_FILTERS);
}

/** Sufixo CSS do efeito exclusivo (vazio para `none`). */
function effectSuffix(effect: ImageEffect): string {
  if (effect === 'grayscale') {
    return ' grayscale(1)';
  }
  if (effect === 'sepia') {
    return ' sepia(1)';
  }
  return '';
}

/**
 * Monta a string CSS `filter` numa ORDEM ESTÁVEL (a mesma no preview e no
 * full-res): `brightness() contrast() saturate()` + efeito. Retorna string
 * vazia quando `f` é o estado neutro — nesse caso nenhum filtro é aplicado.
 */
export function filterString(f: ImageFilters): string {
  if (isDefaultFilters(f)) {
    return '';
  }
  return (
    `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate})` +
    effectSuffix(f.effect)
  );
}
