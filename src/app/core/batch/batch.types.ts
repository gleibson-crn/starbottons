import type { EditorTransform, ResolutionTier, UploadRecord } from '../../shared/types';

/** Tamanhos de botton suportados no MVP (mm). */
export type BottonSize = 32 | 44 | 58;

/** Ordem canônica dos tamanhos (menor → maior). */
export const BOTTON_SIZES: readonly BottonSize[] = [32, 44, 58];

/** Estado de uma arte (uma combinação imagem × tamanho). */
export type ArtStatus = 'idle' | 'generating' | 'ready' | 'failed';

export interface ArtState {
  readonly status: ArtStatus;
  readonly printPngUrl: string | null;
  readonly printPdfUrl: string | null;
  readonly jobId: string | null;
  readonly errorMessage: string | null;
}

/** Estado default de uma arte ainda não gerada. */
export const IDLE_ART: ArtState = {
  status: 'idle',
  printPngUrl: null,
  printPdfUrl: null,
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
  readonly selectedSizes: ReadonlySet<BottonSize>;
  readonly perSizeDpi: Readonly<Record<BottonSize, number>>;
  readonly perSizeTier: Readonly<Record<BottonSize, ResolutionTier>>;
  readonly arts: Readonly<Partial<Record<BottonSize, ArtState>>>;
  readonly uploadError: string | null;
}
