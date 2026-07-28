import type { EditorTransform, GenerateOptionsBody, PrintSpec } from '../../shared/types';
import { computeLayout } from '../../shared/utils';

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
}): GenerateOptionsBody {
  const { pxPerMm } = computeLayout(params.spec, params.editorSide);
  const { offset, scale, rotation, background, backgroundImage } = params.transform;
  const bg = backgroundImage;
  return {
    upload_id: params.uploadId,
    shape_key: 'round',
    size_mm: params.sizeMm,
    options: {
      fit: 'cover',
      offset: { x: offset.x / pxPerMm, y: offset.y / pxPerMm },
      scale,
      rotation,
      background,
      backgroundImage: bg?.path ?? null,
      backgroundOffset: bg
        ? { x: bg.offset.x / pxPerMm, y: bg.offset.y / pxPerMm }
        : { x: 0, y: 0 },
      backgroundScale: bg?.scale ?? 1,
      backgroundRotation: bg?.rotation ?? 0,
    },
  };
}
