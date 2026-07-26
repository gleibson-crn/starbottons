import { inject, Injectable } from '@angular/core';
import JSZip from 'jszip';
import { GenerationGateway } from '../generation';
import type { AssetRecord } from '../../shared/types';
import { runPool } from '../../shared/utils';
import { POOL_CONCURRENCY } from './batch.constants';
import { artFileBase, uniqueFileName, type ArtExt } from './batch-naming';
import { BOTTON_SIZES, type BatchItem, type BottonSize } from './batch.types';

/** Uma arte pronta a incluir no ZIP. */
interface ReadyArt {
  readonly name: string;
  readonly size: BottonSize;
  readonly jobId: string;
}

/** Descriptor final: nome único no ZIP + caminho de storage a assinar. */
interface FileDesc {
  readonly filename: string;
  readonly storagePath: string;
}

export interface ZipResult {
  readonly zipped: number;
  readonly skippedFailures: number;
}

/** Coleta as artes prontas (status ready + jobId) de todos os itens. */
export function collectReadyArts(items: readonly BatchItem[]): ReadyArt[] {
  const out: ReadyArt[] = [];
  for (const item of items) {
    for (const size of BOTTON_SIZES) {
      const art = item.arts[size];
      if (item.selectedSizes.has(size) && art?.status === 'ready' && art.jobId) {
        out.push({ name: item.name, size, jobId: art.jobId });
      }
    }
  }
  return out;
}

/** Conta artes que falharam (para avisar que ficaram de fora do ZIP). */
export function countFailures(items: readonly BatchItem[]): number {
  return items.reduce(
    (acc, item) =>
      acc + BOTTON_SIZES.filter((s) => item.arts[s]?.status === 'failed').length,
    0,
  );
}

/**
 * ZipExportService — monta o ZIP das artes prontas. As signed URLs são
 * assinadas NO CLIQUE (TTL curto, 600s), não na geração. Os bytes são baixados
 * com paralelismo limitado (pool) e nomeados `{nome}-redondo-{tam}mm.{ext}`,
 * resolvendo colisões com sufixo `-2`, `-3`.
 */
@Injectable({ providedIn: 'root' })
export class ZipExportService {
  private readonly gateway = inject(GenerationGateway);

  async export(items: readonly BatchItem[]): Promise<ZipResult> {
    const files = await this.collectFiles(items);
    const zip = new JSZip();
    const tasks = files.map((f) => () => this.addFile(zip, f));
    await runPool(tasks, { concurrency: POOL_CONCURRENCY });
    if (files.length > 0) {
      await this.triggerDownload(zip);
    }
    return { zipped: files.length, skippedFailures: countFailures(items) };
  }

  private async collectFiles(items: readonly BatchItem[]): Promise<FileDesc[]> {
    const used = new Set<string>();
    const out: FileDesc[] = [];
    for (const art of collectReadyArts(items)) {
      const assets = await this.gateway.fetchAssets(art.jobId);
      this.pushKind(out, used, art, assets, 'print_png', 'png');
      this.pushKind(out, used, art, assets, 'print_pdf', 'pdf');
    }
    return out;
  }

  private pushKind(
    out: FileDesc[],
    used: Set<string>,
    art: ReadyArt,
    assets: AssetRecord[],
    kind: 'print_png' | 'print_pdf',
    ext: ArtExt,
  ): void {
    const storagePath = assets.find((a) => a.kind === kind)?.storagePath;
    if (!storagePath) {
      return;
    }
    const filename = uniqueFileName(artFileBase(art.name, art.size), ext, used);
    out.push({ filename, storagePath });
  }

  private async addFile(zip: JSZip, file: FileDesc): Promise<void> {
    const url = await this.gateway.signRender(file.storagePath);
    if (!url) {
      return;
    }
    const res = await fetch(url);
    zip.file(file.filename, await res.blob());
  }

  private async triggerDownload(zip: JSZip): Promise<void> {
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'star-bottons-lote.zip';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
