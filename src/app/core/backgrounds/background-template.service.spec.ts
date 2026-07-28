import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from '../auth';
import { SupabaseClientService } from '../supabase';
import { BackgroundTemplateService } from './background-template.service';

const ROW = {
  id: 'b1',
  name: 'Céu estrelado',
  storage_path: 'user/ceu.png',
  mime: 'image/png',
  bytes: 54321,
  width_px: 1200,
  height_px: 1200,
  requested_by: 'u1',
  created_at: '2026-07-25T10:00:00Z',
};

const removed: string[][] = [];

const fakeSupabase = {
  client: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [ROW], error: null }),
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: 'https://h/obj?token=x' }, error: null }),
        remove: (paths: string[]) => {
          removed.push(paths);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  },
};

const fakeAuth = { user: (): { id: string } => ({ id: 'u1' }) };

describe('BackgroundTemplateService', () => {
  function build(): BackgroundTemplateService {
    TestBed.configureTestingModule({
      providers: [
        BackgroundTemplateService,
        { provide: SupabaseClientService, useValue: fakeSupabase },
        { provide: AuthService, useValue: fakeAuth },
        { provide: APP_CONFIG, useValue: { supabaseUrl: 'https://app', supabaseAnonKey: 'k' } },
      ],
    });
    return TestBed.inject(BackgroundTemplateService);
  }

  it('list() mapeia colunas snake_case → camelCase e assina a thumb', async () => {
    const [t] = await build().list();
    expect(t.id).toBe('b1');
    expect(t.name).toBe('Céu estrelado');
    expect(t.storagePath).toBe('user/ceu.png');
    expect(t.mime).toBe('image/png');
    expect(t.width).toBe(1200);
    expect(t.height).toBe(1200);
    expect(t.createdAt).toBe('2026-07-25T10:00:00Z');
    // host reescrito p/ o supabaseUrl configurado (preserva path+query)
    expect(t.thumbUrl).toBe('https://app/obj?token=x');
  });

  it('remove() apaga a linha e o objeto no bucket uploads', async () => {
    removed.length = 0;
    await build().remove({
      id: 'b1',
      name: 'Céu estrelado',
      storagePath: 'user/ceu.png',
      mime: 'image/png',
      width: 1200,
      height: 1200,
      createdAt: ROW.created_at,
      thumbUrl: null,
    });
    expect(removed[0]).toEqual(['user/ceu.png']);
  });
});
