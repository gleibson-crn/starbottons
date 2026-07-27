/**
 * core/batch — domínio + estado do LOTE (ADR-007), sem UI.
 *
 * Reúne o `BatchStore` (estado por signals), o modelo (`BatchItem` e tamanhos),
 * o gating por resolução, a nomeação de arquivos e a exportação em ZIP. É
 * infraestrutura reusável: os componentes em `features/batch` consomem daqui,
 * assim nenhuma feature precisa importar outra (regra `features-nao-se-importam`).
 */

// Estado do lote
export { BatchStore } from './batch-store.service';

// Exportação em ZIP
export { ZipExportService, collectReadyArts, countFailures } from './zip-export.service';
export type { ZipResult } from './zip-export.service';

// Modelo / tipos
export {
  BOTTON_SIZES,
  IDLE_ART,
} from './batch.types';
export type {
  BottonSize,
  ArtStatus,
  ArtState,
  ItemStatus,
  BatchItem,
} from './batch.types';

// Constantes do fluxo de lote
export {
  MAX_IMAGES,
  MAX_TOTAL_ARTES,
  POOL_CONCURRENCY,
  SIGNED_URL_TTL,
  BATCH_EDITOR_SIDE,
  MODEL_LABEL,
} from './batch.constants';

// Construção/patch imutável de itens
export {
  baseName,
  newUploadingItem,
  withUpload,
  withUploadError,
  withName,
  withToggledSize,
  withTransform,
  withFilters,
  withGenerationUpload,
  withArt,
} from './batch-item';

// Gating por resolução (tier/DPI) e status derivado
export {
  computePerSizeDpi,
  computePerSizeTier,
  defaultSizes,
  largestSelectedSize,
  worstSelectedDpi,
  deriveItemStatus,
} from './batch-gating';

// Nomeação de arquivos das artes
export {
  isNameValid,
  artFileBase,
  artFileName,
  uniqueFileName,
} from './batch-naming';
export type { ArtExt } from './batch-naming';
