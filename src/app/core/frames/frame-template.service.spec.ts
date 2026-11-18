import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from '../auth';
import { SupabaseClientService } from '../supabase';
import { FrameTemplate, FrameTemplateService } from './frame-template.service';

const ROW = {
  id: 'f1',
  name: 'Borda dourada',
  storage_path: 'user/borda.png',
  mime: 'image/png',
  bytes: 54321,
  width_px: 1000,
  height_px: 1000,
  requested_by: 'u1',
  created_at: '2026-08-20T10:00:00Z',
  default_offset_x: 0.1,
  default_offset_y: -0.2,
  default_scale: 1.5,
  default_rotation: 30,
};

let listRows: Record<string, unknown>[] = [ROW];
let updatePayload: Record<string, unknown> | null = null;
let updateId: string | null = null;
let layerRows: Record<string, unknown>[] = [];
let layerInsert: Record<string, unknown>[] | null = null;
let layerDeleted = false;
let copyCall: [string, string] | null = null;
const uploaded: string[] = [];
const events: string[] = [];
const removed: string[][] = [];

const layersTable = {
  select: () => ({
    eq: () => ({
      order: (_c: string, o: { ascending: boolean }) => {
        const dir = o.ascending ? 1 : -1;
        const sorted = [...layerRows].sort(
          (x, y) => ((x['position'] as number) - (y['position'] as number)) * dir,
        );
        return Promise.resolve({ data: sorted, error: null });
      },
    }),
  }),
  delete: () => ({
    eq: () => {
      layerDeleted = true;
      events.push('layers-delete');
      return Promise.resolve({ error: null });
    },
  }),
  insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
    layerInsert = Array.isArray(rows) ? rows : [rows];
    events.push('layers-insert');
    return Promise.resolve({ error: null });
  },
};

const templatesTable = {
  select: (cols: string) => {
    if (cols === 'storage_path') {
      return {
        eq: () => ({
          single: () => Promise.resolve({ data: { storage_path: 'old/flat.png' }, error: null }),
        }),
      };
    }
    return { order: () => Promise.resolve({ data: listRows, error: null }) };
  },
  update: (payload: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      updatePayload = payload;
      updateId = id;
      events.push('template-update');
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { ...ROW, ...payload }, error: null }),
        }),
      };
    },
  }),
  delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
};

const fakeSupabase = {
  client: {
    from: (table: string) => (table === 'frame_template_layers' ? layersTable : templatesTable),
    storage: {
      from: () => ({
        createSignedUrl: (p: string) =>
          Promise.resolve({ data: { signedUrl: `https://h/${p}?token=x` }, error: null }),
        upload: (p: string) => {
          uploaded.push(p);
          events.push('upload');
          return Promise.resolve({ error: null });
        },
        copy: (src: string, dst: string) => {
          copyCall = [src, dst];
          return Promise.resolve({ error: null });
        },
        remove: (paths: string[]) => {
          removed.push(paths);
          events.push('remove');
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  },
};

const fakeAuth = { user: (): { id: string } => ({ id: 'u1' }) };

const TEMPLATE: FrameTemplate = {
  id: 'f1',
  name: 'Borda dourada',
  storagePath: 'user/borda.png',
  mime: 'image/png',
  width: 1000,
  height: 1000,
  createdAt: ROW.created_at,
  thumbUrl: null,
  defaultFraming: { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
  isComposite: false,
};

describe('FrameTemplateService', () => {
  function build(): FrameTemplateService {
    TestBed.configureTestingModule({
      providers: [
        FrameTemplateService,
        { provide: SupabaseClientService, useValue: fakeSupabase },
        { provide: AuthService, useValue: fakeAuth },
        { provide: APP_CONFIG, useValue: { supabaseUrl: 'https://app', supabaseAnonKey: 'k' } },
      ],
    });
    return TestBed.inject(FrameTemplateService);
  }

  it('list() mapeia colunas snake_case → camelCase e assina a thumb', async () => {
    const [t] = await build().list();
    expect(t.id).toBe('f1');
    expect(t.name).toBe('Borda dourada');
    expect(t.storagePath).toBe('user/borda.png');
    expect(t.mime).toBe('image/png');
    expect(t.width).toBe(1000);
    expect(t.height).toBe(1000);
    expect(t.createdAt).toBe('2026-08-20T10:00:00Z');
    // host reescrito p/ o supabaseUrl configurado (preserva path+query)
    expect(t.thumbUrl).toBe('https://app/user/borda.png?token=x');
  });

  it('list() mapeia defaultFraming (offset em fração)', async () => {
    listRows = [ROW];
    const [t] = await build().list();
    expect(t.defaultFraming).toEqual({ offset: { x: 0.1, y: -0.2 }, scale: 1.5, rotation: 30 });
  });

  it('list() usa framing neutro quando as colunas vêm nulas', async () => {
    listRows = [
      {
        ...ROW,
        default_offset_x: null,
        default_offset_y: null,
        default_scale: null,
        default_rotation: null,
      },
    ];
    const [t] = await build().list();
    listRows = [ROW];
    expect(t.defaultFraming).toEqual({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 });
  });

  it('list() mapeia is_composite (e assume false quando ausente)', async () => {
    listRows = [{ ...ROW, is_composite: true }];
    const [on] = await build().list();
    listRows = [ROW];
    expect(on.isComposite).toBe(true);
    TestBed.resetTestingModule();
    const [off] = await build().list();
    expect(off.isComposite).toBe(false);
  });

  it('updateFraming() envia as 4 colunas e devolve o template atualizado', async () => {
    const t = await build().updateFraming('f1', {
      offset: { x: 0.25, y: -0.5 },
      scale: 2,
      rotation: -45,
    });
    expect(updateId).toBe('f1');
    expect(updatePayload).toEqual({
      default_offset_x: 0.25,
      default_offset_y: -0.5,
      default_scale: 2,
      default_rotation: -45,
    });
    expect(t.defaultFraming).toEqual({ offset: { x: 0.25, y: -0.5 }, scale: 2, rotation: -45 });
  });

  it('save() rejeita arquivos que não são PNG', async () => {
    const jpeg = new File(['x'], 'borda.jpg', { type: 'image/jpeg' });
    await expect(build().save({ name: 'X', file: jpeg })).rejects.toThrow(/PNG/);
  });

  it('save() rejeita PNG FALSO (magic bytes não conferem)', async () => {
    // type=image/png mas conteúdo não é PNG → sniff pega o spoof (BL-002).
    const fake = new File(['not-a-real-png'], 'borda.png', { type: 'image/png' });
    await expect(build().save({ name: 'X', file: fake })).rejects.toThrow(/não é um PNG válido/);
  });

  it('remove() apaga a linha e o objeto no bucket uploads', async () => {
    removed.length = 0;
    layerRows = [];
    await build().remove(TEMPLATE);
    expect(removed[0]).toEqual(['user/borda.png']);
  });

  it('remove() apaga também os PNGs das camadas (sem duplicar o achatado)', async () => {
    removed.length = 0;
    layerRows = [
      { id: 'l0', position: 0, storage_path: 'user/borda.png' },
      { id: 'l1', position: 1, storage_path: 'frame-layers/a.png' },
    ];
    await build().remove({ ...TEMPLATE, isComposite: true });
    layerRows = [];
    expect(removed[0]).toEqual(['user/borda.png', 'frame-layers/a.png']);
  });

  it('listLayers() ordena por position e assina as URLs', async () => {
    layerRows = [
      {
        id: 'b',
        position: 1,
        storage_path: 'p/b.png',
        offset_x: 0.1,
        offset_y: 0.2,
        scale: 2,
        rotation: 5,
        source: 'template',
        origin_template_id: 't9',
      },
      {
        id: 'a',
        position: 0,
        storage_path: 'p/a.png',
        offset_x: 0,
        offset_y: 0,
        scale: 1,
        rotation: 0,
        source: 'upload',
        origin_template_id: null,
      },
    ];
    const layers = await build().listLayers('f1');
    layerRows = [];
    expect(layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(layers[1]).toEqual({
      id: 'b',
      storagePath: 'p/b.png',
      url: 'https://app/p/b.png?token=x',
      offset: { x: 0.1, y: 0.2 },
      scale: 2,
      rotation: 5,
      source: 'template',
      originTemplateId: 't9',
    });
  });

  describe('saveComposition()', () => {
    const layer = (p: string) => ({
      storagePath: p,
      offset: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      source: 'upload' as const,
    });
    const blob = new Blob(['x'], { type: 'image/png' });

    beforeEach(() => {
      removed.length = 0;
      uploaded.length = 0;
      events.length = 0;
      layerInsert = null;
      layerDeleted = false;
      layerRows = [
        { id: 'l0', position: 0, storage_path: 'old/layer0.png' },
        { id: 'l1', position: 1, storage_path: 'old/keep.png' },
      ];
    });
    afterEach(() => {
      layerRows = [];
    });

    it('valida 1..8 camadas', async () => {
      const svc = build();
      await expect(svc.saveComposition('f1', [], blob)).rejects.toThrow(/1 a 8/);
      const nine = Array.from({ length: 9 }, (_, i) => layer(`p/${i}`));
      await expect(svc.saveComposition('f1', nine, blob)).rejects.toThrow(/1 a 8/);
      expect(uploaded).toEqual([]);
    });

    it('sobe o achatado, substitui camadas, atualiza a linha e apaga órfãos (nesta ordem)', async () => {
      const t = await build().saveComposition(
        'f1',
        [layer('old/keep.png'), layer('new/c.png')],
        blob,
      );
      expect(uploaded[0]).toMatch(/^frame-composites\/.+\.png$/);
      expect(layerDeleted).toBe(true);
      expect(layerInsert?.map((r) => r['position'])).toEqual([0, 1]);
      expect(layerInsert?.map((r) => r['storage_path'])).toEqual(['old/keep.png', 'new/c.png']);
      expect(updatePayload).toEqual({ storage_path: uploaded[0], is_composite: true });
      expect(t.isComposite).toBe(true);
      expect(events).toEqual([
        'upload',
        'layers-delete',
        'layers-insert',
        'template-update',
        'remove',
      ]);
      // órfãos: achatado antigo + camada que saiu; 'old/keep.png' permanece
      expect(removed[0]).toEqual(['old/flat.png', 'old/layer0.png']);
    });

    it('is_composite=false com 1 camada', async () => {
      await build().saveComposition('f1', [layer('new/c.png')], blob);
      expect(updatePayload?.['is_composite']).toBe(false);
    });
  });

  it('copyPng() copia para um novo path frame-layers/{uuid}.png', async () => {
    const dst = await build().copyPng('user/borda.png');
    expect(dst).toMatch(/^frame-layers\/.+\.png$/);
    expect(copyCall).toEqual(['user/borda.png', dst]);
  });
});
