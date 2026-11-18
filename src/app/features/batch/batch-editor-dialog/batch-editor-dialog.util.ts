import type { WritableSignal } from '@angular/core';
import type { EditorTransform, Framing } from '../../../shared/types';
import { DEFAULT_BACKGROUND_FRAMING } from '../../../shared/types';
import type { UploadService } from '../../../core/upload';
import { downscaleImageFile, loadImage } from '../../../shared/utils';

/** Fase de carregamento de uma galeria de templates (fundo/moldura). */
export type GalleryPhase = 'idle' | 'loading' | 'ready' | 'error';

/**
 * (Re)carrega os `HTMLImageElement` das molduras alinhados por índice aos `refs`,
 * usando um cache por URL (não recarrega ao reordenar/editar enquadramento). Ao
 * terminar um load, realinha com os refs ATUAIS (`current()`, pois podem ter
 * mudado durante o load). Fonte única do sync da pilha de molduras.
 */
export function loadFrameEls(
  refs: readonly { url: string }[],
  cache: Map<string, HTMLImageElement>,
  current: () => readonly { url: string }[],
  set: (els: readonly (HTMLImageElement | null)[]) => void,
): void {
  set(refs.map((r) => cache.get(r.url) ?? null));
  for (const r of refs) {
    if (cache.has(r.url)) {
      continue;
    }
    const url = r.url;
    void loadImage(url)
      .then((img) => {
        cache.set(url, img);
        set(current().map((x) => cache.get(x.url) ?? null));
      })
      .catch(() => undefined);
  }
}

/** Novo índice ATIVO após remover `removed` de uma lista que ficou com `newLen`. */
export function activeAfterRemove(active: number, removed: number, newLen: number): number {
  if (active === removed) {
    return Math.min(removed, newLen - 1);
  }
  return active > removed ? active - 1 : active;
}

/** Novo índice ATIVO após mover `from`↔`to` (segue a camada movida). */
export function activeAfterReorder(active: number, from: number, to: number): number {
  return active === from ? to : active === to ? from : active;
}

/** Referência de upload de uma camada (fundo/moldura) recém-enviada. */
export interface UploadedLayerRef {
  readonly path: string;
  readonly url: string;
  readonly source: 'upload';
}

/**
 * Sobe uma imagem de camada (fundo ou moldura): reduz (preservando o alfa do
 * PNG), sonda dimensões e envia ao bucket `uploads`, devolvendo a ref. Fonte
 * ÚNICA do fluxo de upload das duas camadas (evita duplicação bg/moldura).
 */
export async function uploadLayerImage(
  file: File,
  uploads: Pick<UploadService, 'probe' | 'upload'>,
): Promise<UploadedLayerRef> {
  const small = await downscaleImageFile(file);
  const probe = await uploads.probe(small);
  const rec = await uploads.upload(small, probe);
  return { path: rec.path, url: rec.previewUrl, source: 'upload' };
}

/**
 * Carrega (ou limpa) o `HTMLImageElement` de uma camada (fundo/moldura) a partir
 * da URL atual, guardando contra corrida: só grava se `stillCurrent(url)` ainda
 * for verdade quando a imagem termina de carregar. Fonte única do sync bg/moldura.
 */
export function loadLayerImageEl(
  url: string | null,
  target: WritableSignal<HTMLImageElement | null>,
  stillCurrent: (loadedUrl: string) => boolean,
): void {
  if (!url) {
    target.set(null);
    return;
  }
  void loadImage(url).then((img) => {
    if (stillCurrent(url)) {
      target.set(img);
    }
  });
}

/**
 * Carrega uma galeria de templates UMA vez (idempotente): não recarrega quando
 * já está `loading`/`ready`, exceto quando `force` (retry após erro). Fonte única
 * das galerias de fundo e de moldura.
 */
export async function loadGallery<T>(
  phase: WritableSignal<GalleryPhase>,
  templates: WritableSignal<T[]>,
  listFn: () => Promise<T[]>,
  force: boolean,
): Promise<void> {
  const cur = phase();
  if (!force && (cur === 'loading' || cur === 'ready')) {
    return;
  }
  phase.set('loading');
  try {
    templates.set(await listFn());
    phase.set('ready');
  } catch {
    phase.set('error');
  }
}

/** Extrai o enquadramento de uma ref de fundo (ou o neutro se `null`). */
export function framingOf(ref: EditorTransform['backgroundImage']): Framing {
  if (!ref) {
    return DEFAULT_BACKGROUND_FRAMING;
  }
  return { offset: ref.offset, scale: ref.scale, rotation: ref.rotation };
}

/** `true` quando dois enquadramentos são idênticos (evita escritas redundantes). */
export function sameFraming(a: Framing, b: Framing): boolean {
  return (
    a.offset.x === b.offset.x &&
    a.offset.y === b.offset.y &&
    a.scale === b.scale &&
    a.rotation === b.rotation
  );
}
