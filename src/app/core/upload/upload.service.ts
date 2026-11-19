import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth';
import { SupabaseClientService } from '../supabase';
import type { UploadRecord } from '../../shared/types';
import { loadImage, safeFileName } from '../../shared/utils';
import { type LocalBackendApi, localBackend } from '../local-backend/local-api';

const BUCKET = 'uploads';

/** Dimensões naturais + preview local de um arquivo de imagem. */
export interface ImageProbe {
  readonly width: number;
  readonly height: number;
  readonly previewUrl: string;
}

/**
 * UploadService — sobe a imagem para o bucket privado `uploads` e registra a
 * linha em `uploads`, devolvendo o `UploadRecord` usado por `generate-art`.
 *
 * Robustez em dev paralelo: se o INSERT falhar (schema ainda em construção),
 * cai para um id local (UUID) e sinaliza via exceção tratável a montante.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly auth = inject(AuthService);
  /** Backend local (Electron) quando presente; senão `null` → caminho Supabase. */
  private readonly local = localBackend();

  /** Lê largura/altura da imagem e cria um object URL de preview. */
  async probe(file: File): Promise<ImageProbe> {
    const previewUrl = URL.createObjectURL(file);
    const img = await loadImage(previewUrl);
    return { width: img.naturalWidth, height: img.naturalHeight, previewUrl };
  }

  /** Faz upload do arquivo e registra o metadado; retorna o `UploadRecord`. */
  async upload(file: File, probe: ImageProbe): Promise<UploadRecord> {
    if (this.local) {
      return this.uploadLocal(this.local, file, probe);
    }
    const userId = this.auth.user()?.id ?? 'anon';
    const path = `${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      throw new Error(`Falha no upload: ${error.message}`);
    }

    const id = await this.insertRecord(path, file, probe, userId);
    return {
      id,
      path,
      fileName: file.name,
      width: probe.width,
      height: probe.height,
      previewUrl: probe.previewUrl,
    };
  }

  /**
   * Upload no backend LOCAL (Electron): grava o arquivo + a linha em `uploads`
   * via IPC e devolve o `UploadRecord`. O preview reusa o object URL do `probe`.
   */
  private async uploadLocal(
    local: LocalBackendApi,
    file: File,
    probe: ImageProbe,
  ): Promise<UploadRecord> {
    const bytes = await file.arrayBuffer();
    const { id, path } = await local.uploads.save({
      bytes,
      filename: file.name,
      mime: file.type,
      width: probe.width,
      height: probe.height,
    });
    return {
      id,
      path,
      fileName: file.name,
      width: probe.width,
      height: probe.height,
      previewUrl: probe.previewUrl,
    };
  }

  private async insertRecord(
    path: string,
    file: File,
    probe: ImageProbe,
    userId: string,
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from(BUCKET)
      .insert({
        storage_path: path,
        user_id: userId,
        filename: file.name,
        mime: file.type,
        width_px: probe.width,
        height_px: probe.height,
        bytes: file.size,
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`Falha ao registrar upload: ${error?.message ?? 'sem id'}`);
    }
    return (data as { id: string }).id;
  }
}
