import type { EditorTransform } from './editor';

/** Corpo (sem `job_id`) montado a partir do enquadramento do editor. */
export interface GenerateOptionsBody {
  readonly upload_id: string;
  readonly shape_key: 'round';
  readonly size_mm: number;
  readonly options: {
    readonly fit: 'cover';
    /** Offset em MILÍMETROS relativo ao centro da arte. */
    readonly offset: EditorTransform['offset'];
    readonly scale: number;
    readonly rotation: number;
    /** Espelhar a arte na horizontal (eixo local, após a rotação). */
    readonly flipH?: boolean;
    /** Espelhar a arte na vertical (eixo local, após a rotação). */
    readonly flipV?: boolean;
    readonly background: string;
    /** Caminho da imagem de fundo no Storage, ou `null` para usar só a cor. */
    readonly backgroundImage: string | null;
    /** Offset do fundo em MILÍMETROS (mesma conversão px→mm da arte). */
    readonly backgroundOffset: EditorTransform['offset'];
    /** Zoom do fundo (1 = cover exato). */
    readonly backgroundScale: number;
    /** Rotação do fundo em graus. */
    readonly backgroundRotation: number;
    /**
     * MOLDURAS empilhadas (camadas decorativas por cima da arte) na ordem do
     * array = z-order (índice 0 ao fundo; última no topo). Cada uma: `path` no
     * bucket `uploads`, `offset` em MILÍMETROS (mesma conversão px→mm da arte),
     * `scale` (1 = cover) e `rotation` em graus. `[]` = sem moldura.
     */
    /** Número impresso na sangria (traseira); `null`/ausente = sem número. */
    readonly sequenceLabel?: string | null;
    readonly frames: {
      readonly path: string;
      readonly offset: { x: number; y: number };
      readonly scale: number;
      readonly rotation: number;
    }[];
  };
}

/** Corpo real enviado à Edge `generate-art` (inclui o `job_id` idempotente). */
export interface GenerateRequest extends GenerateOptionsBody {
  /** UUID v4 gerado no client; o backend faz UPSERT por ele (idempotência). */
  readonly job_id: string;
}

/** Tipos de asset produzidos pela geração. */
export type AssetKind = 'print_png' | 'mockup_png' | 'preview_webp';

/** Asset retornado pela Edge (200) — já com signed URL. */
export interface EdgeAsset {
  readonly kind: AssetKind;
  readonly signed_url: string;
  readonly width_px?: number;
  readonly height_px?: number;
  readonly dpi?: number;
}

/** Resultado final consumido pelo ResultPage (URLs assinadas de impressão). */
export interface GenerationResult {
  readonly jobId: string;
  /** Signed URL do PNG de impressão (bucket `renders`). */
  readonly printPngUrl: string | null;
}

/** Linha de `generation_jobs` consultada no fallback de polling. */
export interface GenerationJob {
  readonly id: string;
  readonly status: 'queued' | 'processing' | 'done' | 'error';
  readonly errorMessage?: string | null;
}

/** Linha de `assets` (buscada por `job_id` após o job concluir). */
export interface AssetRecord {
  readonly kind: AssetKind;
  readonly storagePath: string;
}

/** Resultado bruto do gateway (status HTTP + corpo). */
export interface GatewayResponse {
  readonly status: number;
  readonly body: unknown;
}
