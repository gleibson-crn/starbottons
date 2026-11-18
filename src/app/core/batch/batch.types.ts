import type {
  EditorTransform,
  ImageFilters,
  ResolutionTier,
  StyleEffect,
  UploadRecord,
} from '../../shared/types';

/** Tamanhos de botton suportados no MVP (mm). */
export type BottonSize = 32 | 44 | 58;

/** Ordem canônica dos tamanhos (menor → maior). */
export const BOTTON_SIZES: readonly BottonSize[] = [32, 44, 58];

/** Estado de uma arte (uma combinação imagem × tamanho). */
export type ArtStatus = 'idle' | 'generating' | 'ready' | 'failed';

export interface ArtState {
  readonly status: ArtStatus;
  readonly printPngUrl: string | null;
  readonly jobId: string | null;
  readonly errorMessage: string | null;
}

/** Estado default de uma arte ainda não gerada. */
export const IDLE_ART: ArtState = {
  status: 'idle',
  printPngUrl: null,
  jobId: null,
  errorMessage: null,
};

/**
 * Status derivado de um item do lote:
 * - `uploading`/`error`: ciclo de upload.
 * - `ready`: enviado, sem geração iniciada.
 * - `generating`: alguma arte em voo.
 * - `done`: todas as artes selecionadas prontas.
 * - `partial`: mistura de prontas e falhas.
 * - `failed`: todas as artes selecionadas falharam.
 */
export type ItemStatus =
  | 'uploading'
  | 'error'
  | 'ready'
  | 'generating'
  | 'done'
  | 'partial'
  | 'failed';

/** Uma imagem do lote e todo o seu estado (espelha a spec de UX). */
export interface BatchItem {
  readonly id: string;
  /** Nome dado pelo usuário (obrigatório) — base do nome do arquivo. */
  readonly name: string;
  readonly upload: UploadRecord | null;
  readonly fileName: string;
  readonly previewUrl: string;
  readonly width: number;
  readonly height: number;
  readonly transform: EditorTransform;
  /** Lado (px) do editor em que `transform` foi ajustado. */
  readonly editorSide: number;
  /** Tratamento/filtros de imagem (default = neutro, nenhum filtro). */
  readonly filters: ImageFilters;
  /**
   * Efeito de estilo por pixel (ADR-019). Ausente/`none` = sem estilo (bake
   * segue o caminho tonal do ADR-014). Como os filtros, é baked full-res no
   * upload tratado e invalida `generationUpload` ao mudar.
   */
  readonly style?: StyleEffect;
  /**
   * Upload tratado full-res desta imagem (Abordagem A do ADR-014). `null` quando
   * os filtros são neutros ou o tratado ainda não foi materializado; ao gerar
   * com filtros é preenchido uma vez e reusado por todos os tamanhos do item.
   */
  readonly generationUpload: UploadRecord | null;
  /**
   * Trilha 2 (ADR-021) — `true` quando a imagem foi estilizada por IA e o
   * `generationUpload` já contém o PNG tratado full-res estilizado (vindo da
   * Edge `style-transfer`). Força `needsTreated` mesmo em imagens pequenas, para
   * que a geração use o upload estilizado e não o original. É resetado por
   * `withFilters`/`withStyle` (mexer nos filtros locais reprocessa o item).
   */
  readonly aiStyled?: boolean;
  /**
   * "Remover fundo" (ISNet local): `true` quando a pessoa foi recortada. O PNG
   * transparente (`cutoutUpload`) vira a FONTE de geração (como `generationUpload`),
   * mas o `upload` ORIGINAL fica intacto (desfazer) e filtros/estilo CONTINUAM
   * valendo sobre o recorte no bake.
   */
  readonly cutout?: boolean;
  /** Upload do recorte (PNG com alfa) — fonte do bake tratado quando `cutout`. */
  readonly cutoutUpload?: UploadRecord | null;
  readonly selectedSizes: ReadonlySet<BottonSize>;
  readonly perSizeDpi: Readonly<Record<BottonSize, number>>;
  readonly perSizeTier: Readonly<Record<BottonSize, ResolutionTier>>;
  readonly arts: Readonly<Partial<Record<BottonSize, ArtState>>>;
  readonly uploadError: string | null;
  /**
   * Número (senha) MANUAL digitado pelo dono (só dígitos, ≤8). Vazio por padrão.
   * Impresso na sangria só se `BatchStore.numbered`.
   */
  readonly seqLabel: string;
}
