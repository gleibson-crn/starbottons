/**
 * core/print — empacotamento PURO de artes numa folha física (A4), sem Angular
 * nem DOM. O `packSheet` (shelf First-Fit-Decreasing) é a fonte da verdade da
 * geometria da folha; a página `features/print` só consome o resultado.
 */
export { A4, packSheet } from './sheet-packer';
export type {
  BottonSize,
  SheetInput,
  PageSpec,
  PlacedPiece,
  PackedSheet,
} from './sheet-packer';
