import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { AuthService } from '../../core/auth';
import { SupabaseClientService } from '../../core/supabase';
import { ContextualTemplateService } from './contextual-template.service';
import type { SceneTarget } from './scene-target';

// encodeScene usa canvas 2D + toBlob; no ambiente de teste (sem canvas real)
// stubamos getContext/toBlob p/ focar na orquestração DB + storage do service.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => undefined,
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (cb: BlobCallback) => cb(new Blob(['webp-bytes'], { type: 'image/webp' })),
  );
});

const ROW = {
  id: 't1',
  name: 'Camisa preta',
  storage_path: 'old/scene.webp',
  mime: 'image/webp',
  bytes: 100,
  scene_width_px: 800,
  scene_height_px: 600,
  target: { cx: 0.5, cy: 0.5, r: 0.2, rotation: 0 },
  created_at: '2026-07-25T10:00:00Z',
};

const NEW_TARGET: SceneTarget = { cx: 0.3, cy: 0.7, r: 0.25, rotation: 30 };

interface Calls {
  updates: Record<string, unknown>[];
  uploads: { path: string; size: number }[];
  removes: string[][];
}

function buildClient(calls: Calls) {
  return {
    from: () => ({
      // currentPath(): select('storage_path').eq().single()
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: { storage_path: ROW.storage_path }, error: null }),
        }),
        order: () => Promise.resolve({ data: [ROW], error: null }),
      }),
      // updateRow(): update(changes).eq().select().single()
      update: (changes: Record<string, unknown>) => {
        calls.updates.push(changes);
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { ...ROW, ...changes }, error: null }),
            }),
          }),
        };
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string, blob: Blob) => {
          calls.uploads.push({ path, size: blob.size });
          return Promise.resolve({ error: null });
        },
        remove: (paths: string[]) => {
          calls.removes.push(paths);
          return Promise.resolve({ error: null });
        },
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: 'https://h/o?token=x' }, error: null }),
      }),
    },
  };
}

function build(calls: Calls): ContextualTemplateService {
  TestBed.configureTestingModule({
    providers: [
      ContextualTemplateService,
      { provide: SupabaseClientService, useValue: { client: buildClient(calls) } },
      { provide: AuthService, useValue: { user: () => ({ id: 'u1' }) } },
      { provide: APP_CONFIG, useValue: { supabaseUrl: 'https://app', supabaseAnonKey: 'k' } },
    ],
  });
  return TestBed.inject(ContextualTemplateService);
}

describe('ContextualTemplateService.update', () => {
  it('patch só de target: grava o novo alvo, sem tocar no storage', async () => {
    const calls: Calls = { updates: [], uploads: [], removes: [] };
    const out = await build(calls).update('t1', { target: NEW_TARGET });

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]).toEqual({ target: NEW_TARGET });
    expect(calls.uploads).toHaveLength(0);
    expect(calls.removes).toHaveLength(0);
    expect(out.target).toEqual(NEW_TARGET);
    expect(out.storagePath).toBe('old/scene.webp');
  });

  it('troca de cena: sobe o novo objeto, aponta a linha p/ ele e remove o antigo', async () => {
    const calls: Calls = { updates: [], uploads: [], removes: [] };
    const scene = { naturalWidth: 1024, naturalHeight: 768 } as HTMLImageElement;
    const out = await build(calls).update('t1', { target: NEW_TARGET, scene });

    // upload do novo WebP
    expect(calls.uploads).toHaveLength(1);
    const newPath = calls.uploads[0].path;
    expect(newPath).toMatch(/^u1\/.*-scene\.webp$/);

    // updateRow aponta p/ o novo objeto + dims + target
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]).toMatchObject({
      target: NEW_TARGET,
      storage_path: newPath,
      mime: 'image/webp',
      scene_width_px: 1024,
      scene_height_px: 768,
    });

    // objeto antigo removido do bucket (sem órfão)
    expect(calls.removes).toEqual([['old/scene.webp']]);
    expect(out.storagePath).toBe(newPath);
    expect(out.sceneWidth).toBe(1024);
  });
});
