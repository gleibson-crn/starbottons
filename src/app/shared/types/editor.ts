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
  /**
   * Deslocamento do centro da imagem de fundo, em px de tela do editor (mesma
   * unidade do `offset` da arte). `{0,0}` = centrado.
   */
  readonly offset: { x: number; y: number };
  /** Fator de zoom do fundo (1 = "cover" exato do círculo). */
  readonly scale: number;
  /** Rotação livre do fundo em graus (−180..+180). */
  readonly rotation: number;
}

/**
 * Referência a uma MOLDURA do botton (camada decorativa PNG por cima da arte).
 * Espelho EXATO de `BackgroundImageRef`: carrega enquadramento próprio
 * (offset/scale/rotation), pois cada moldura é reposicionável/redimensionável/
 * girável (arrastar/zoom/rodar). Nasce em COVER (offset {0,0}, scale 1, 0°) e o
 * gesto ajusta a partir daí. O mesmo objeto serve ao preview (via `url`, um
 * object URL) e à Edge (via `path`, o caminho no Storage bucket `uploads`).
 */
export interface FrameImageRef {
  /** Caminho no Storage bucket `uploads`. */
  readonly path: string;
  /** URL para preview (object URL do upload ou signed URL do template). */
  readonly url: string;
  /** Origem da moldura. */
  readonly source: 'upload' | 'template';
  /** Id do template (ausente em uploads). */
  readonly id?: string;
  /**
   * Deslocamento do centro da moldura, em px de tela do editor (mesma unidade do
   * `offset` da arte/fundo). `{0,0}` = centrada (COVER).
   */
  readonly offset: { x: number; y: number };
  /** Fator de zoom da moldura (1 = "cover" exato do círculo visível). */
  readonly scale: number;
  /** Rotação livre da moldura em graus (−180..+180). */
  readonly rotation: number;
}

/**
 * Enquadramento genérico de uma camada (posição/zoom/rotação). Compartilhado
 * pelas mesmas funções de gesto usadas pela arte (`EditorTransform`) e pela
 * imagem de fundo. O canvas-editor muta um `Framing` do fundo ou o transform da
 * arte conforme a camada ativa.
 */
export interface Framing {
  readonly offset: { x: number; y: number };
  readonly scale: number;
  readonly rotation: number;
}

/** Enquadramento neutro (fundo centrado, cover exato, sem rotação). */
export const DEFAULT_BACKGROUND_FRAMING: Framing = {
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
};

export interface EditorTransform {
  /** Deslocamento do centro da imagem, em px de tela do editor. */
  readonly offset: { x: number; y: number };
  /** Fator de zoom (1 = "cover" exato da arte). */
  readonly scale: number;
  /** Rotação livre em graus (−180..+180). */
  readonly rotation: number;
  /** Espelhar a arte na horizontal (eixo local da imagem). Ausente = false. */
  readonly flipH?: boolean;
  /** Espelhar a arte na vertical (eixo local da imagem). Ausente = false. */
  readonly flipV?: boolean;
  /** Cor sólida de fundo para área vazia (hex, default branco). */
  readonly background: string;
  /**
   * Imagem de fundo (por cima da cor, por baixo da arte). `null` = usar só a
   * cor `background`. Preenche o círculo em COVER fixo (sem o transform do
   * usuário).
   */
  readonly backgroundImage: BackgroundImageRef | null;
  /**
   * Molduras decorativas EMPILHADAS (camadas PNG por cima da arte, no TOPO). Até
   * 3. A ORDEM do array é o z-order: índice 0 = mais ao fundo, última = topo.
   * `[]` = sem moldura. Cada moldura tem enquadramento próprio e cobre o círculo
   * VISÍVEL. Ordem de composição: cor → fundo → arte → molduras (0..n).
   */
  readonly frameImages: readonly FrameImageRef[];
}

/** Estado default seguro do editor (sem ajuste, fundo branco, sem imagem). */
export const DEFAULT_TRANSFORM: EditorTransform = {
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  background: '#ffffff',
  backgroundImage: null,
  frameImages: [],
};

/**
 * Forma LEGADA do transform: UMA moldura `frameImage` COVER fixo (antes do
 * empilhamento). Usada só pela migração `normalizeFrameImages`.
 */
interface LegacyFrameImageRef {
  readonly path: string;
  readonly url: string;
  readonly source: 'upload' | 'template';
  readonly id?: string;
}

/**
 * Lista de molduras de um transform, TOLERANTE ao formato antigo. Se já houver
 * `frameImages`, retorna-a; senão converte um `frameImage` legado (único, COVER
 * fixo) para uma lista de 1 em enquadramento neutro; senão `[]`. Garante
 * retrocompat de itens salvos antes do empilhamento.
 */
export function normalizeFrameImages(
  t: EditorTransform,
): readonly FrameImageRef[] {
  const raw = t as unknown as {
    frameImages?: readonly FrameImageRef[];
    frameImage?: LegacyFrameImageRef | null;
  };
  if (raw.frameImages) {
    return raw.frameImages;
  }
  if (raw.frameImage) {
    return [
      { ...raw.frameImage, offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
    ];
  }
  return [];
}

/**
 * Devolve `t` com `frameImages` SEMPRE presente (migrando o `frameImage` legado
 * quando preciso). Idempotente — útil ao hidratar um item possivelmente antigo.
 */
export function migrateTransform(t: EditorTransform): EditorTransform {
  const raw = t as unknown as { frameImages?: readonly FrameImageRef[] };
  if (raw.frameImages) {
    return t;
  }
  const { ...rest } = t as unknown as Record<string, unknown>;
  delete rest['frameImage'];
  return { ...(rest as unknown as EditorTransform), frameImages: normalizeFrameImages(t) };
}

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
