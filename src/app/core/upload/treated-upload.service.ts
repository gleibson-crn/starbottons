import { inject, Injectable } from '@angular/core';
import type { ImageFilters, UploadRecord } from '../../shared/types';
import { UploadService } from './upload.service';
import {
  renderFilteredBlob,
  treatedFileName,
  type CanvasFactory,
  type FilterSource,
} from './treated-image';

/** Imagem de origem usada para gerar a versão tratada full-res. */
export type TreatSource = CanvasImageSource & FilterSource;

/**
 * TreatedUploadService — implementa a ABORDAGEM A (ADR-014). Ao gerar arte com
 * filtros, cria uma versão FULL-RES tratada (PNG lossless) e a sobe ao bucket
 * `uploads` como um NOVO upload, devolvendo um `UploadRecord` com novo id. A
 * Edge `generate-art` e seu contrato ficam INALTERADOS — apenas recebe outro
 * `upload_id`. O upload original é preservado pelo chamador.
 */
@Injectable({ providedIn: 'root' })
export class TreatedUploadService {
  private readonly uploads = inject(UploadService);

  /** Gera o PNG tratado full-res e o registra como novo upload. */
  async createTreatedUpload(
    image: TreatSource,
    filters: ImageFilters,
    sourceName: string,
    createCanvas?: CanvasFactory,
  ): Promise<UploadRecord> {
    const blob = await renderFilteredBlob(image, filters, createCanvas);
    const file = new File([blob], treatedFileName(sourceName), {
      type: 'image/png',
    });
    const probe = {
      width: image.naturalWidth,
      height: image.naturalHeight,
      previewUrl: URL.createObjectURL(blob),
    };
    return this.uploads.upload(file, probe);
  }
}
