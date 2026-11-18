/**
 * shared/imaging — estágio "style pass" por pixel (ADR-019, Trilha 1). Funções
 * PURAS `ImageData→ImageData` (boxBlur/posterize/pencilSketch/quantizeColors/
 * halftone), o dispatcher `applyStyleEffect`, o orquestrador `prepareArt`
 * (fonte única, com CanvasFactory injetável) e o offload `runStylePass` (Web
 * Worker). É folha PURA: NÃO importa @angular/* (regra `imaging-e-puro`).
 */
export { boxBlur } from './box-blur';
export { posterize } from './posterize';
export { pencilSketch, type SketchOptions } from './pencil-sketch';
export { quantizeColors } from './quantize-colors';
export { halftone, type HalftoneOptions } from './halftone';
export { applyStyleEffect } from './apply-style-effect';
export { prepareArt, type PreparedArt, type CanvasFactory } from './prepare-art';
export { runStylePass } from './run-style-pass';
export { runCutout, CUTOUT_LOAD_ERROR, type CutoutStage } from './run-cutout';
export {
  keepMainComponents,
  KEEP_COMPONENT_RATIO,
  DEFAULT_CUTOUT_THRESHOLD,
  CUTOUT_THRESHOLD_MIN,
  CUTOUT_THRESHOLD_MAX,
  type RgbaBuffer,
} from './cutout-postprocess';
