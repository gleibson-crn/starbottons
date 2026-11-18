import type { EditorTransform, GenerateOptionsBody, PrintSpec } from '../../shared/types';
import { normalizeFrameImages } from '../../shared/types';
import { computeLayout } from '../../shared/utils';

/** Molduras (z-order = ordem do array) com offset convertido de px para mm. */
function framesToMm(
  transform: EditorTransform,
  pxPerMm: number,
): GenerateOptionsBody['options']['frames'] {
  return normalizeFrameImages(transform).map((f) => ({
    path: f.path,
    offset: { x: f.offset.x / pxPerMm, y: f.offset.y / pxPerMm },
    scale: f.scale,
    rotation: f.rotation,
  }));
}

/**
 * Monta o corpo de `generate-art`. O offset do editor está em px de tela; aqui
 * é convertido para MILÍMETROS (dividindo pela escala px/mm do layout), ficando
 * independente da resolução do canvas — o server reconstrói via a mesma
 * matemática mm↔px compartilhada.
 */
export function buildGenerateRequest(params: {
  uploadId: string;
  sizeMm: number;
  spec: PrintSpec;
  transform: EditorTransform;
  editorSide: number;
  /** Texto do número sequencial (sangria); `null`/ausente = sem número. */
  sequenceLabel?: string | null;
}): GenerateOptionsBody {
  const { pxPerMm } = computeLayout(params.spec, params.editorSide);
  const { offset, scale, rotation, flipH, flipV, background, backgroundImage } =
    params.transform;
  const bg = backgroundImage;
  // Molduras: ordem do array = z-order. Offset px→mm com o MESMO pxPerMm da arte
  // (independe da resolução do editor); lista vazia → `[]`.
  const frames = framesToMm(params.transform, pxPerMm);
  return {
    upload_id: params.uploadId,
    shape_key: 'round',
    size_mm: params.sizeMm,
    options: {
      fit: 'cover',
      offset: { x: offset.x / pxPerMm, y: offset.y / pxPerMm },
      scale,
      rotation,
      flipH: !!flipH,
      flipV: !!flipV,
      background,
      backgroundImage: bg?.path ?? null,
      backgroundOffset: bg
        ? { x: bg.offset.x / pxPerMm, y: bg.offset.y / pxPerMm }
        : { x: 0, y: 0 },
      backgroundScale: bg?.scale ?? 1,
      backgroundRotation: bg?.rotation ?? 0,
      frames,
      sequenceLabel: params.sequenceLabel ?? null,
    },
  };
}
