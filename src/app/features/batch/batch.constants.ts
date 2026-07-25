/** Constantes do fluxo de LOTE (ADR-007). */

/** Máximo de imagens por lote. */
export const MAX_IMAGES = 25;

/** Máximo de artes por lote (25 imagens × 3 tamanhos). */
export const MAX_TOTAL_ARTES = 75;

/** Tarefas de geração/download em voo simultâneas no pool. */
export const POOL_CONCURRENCY = 4;

/**
 * TTL das signed URLs — alinhado ao gateway (`renders`, 600s). As URLs do ZIP
 * são assinadas no clique justamente por esse tempo curto.
 */
export const SIGNED_URL_TTL = 600;

/** Lado (px) de referência do editor no lote — base p/ normalizar offset→mm. */
export const BATCH_EDITOR_SIDE = 520;

/** Modelo por extenso usado no nome do arquivo (`{nome}-{modelo}-{tam}mm`). */
export const MODEL_LABEL = 'redondo';
