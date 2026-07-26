import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { AuthService } from '../../core/auth';
import { SupabaseClientService } from '../../core/supabase';
import { ContextualTemplateService } from './contextual-template.service';

const ROW = {
  id: 't1',
  name: 'Camisa preta',
  storage_path: 'user/abc.webp',
  mime: 'image/webp',
  bytes: 12345,
  scene_width_px: 1600,
  scene_height_px: 1200,
  target: { cx: 0.5, cy: 0.4, r: 0.2, rotation: 15 },
  created_at: '2026-07-25T10:00:00Z',
};

const fakeSupabase = {
  client: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [ROW], error: null }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: 'https://h/obj?token=x' }, error: null }),
      }),
    },
  },
};

const fakeAuth = { user: (): { id: string } => ({ id: 'u1' }) };

describe('ContextualTemplateService', () => {
  function build(): ContextualTemplateService {
    TestBed.configureTestingModule({
      providers: [
        ContextualTemplateService,
        { provide: SupabaseClientService, useValue: fakeSupabase },
        { provide: AuthService, useValue: fakeAuth },
        { provide: APP_CONFIG, useValue: { supabaseUrl: 'https://app', supabaseAnonKey: 'k' } },
      ],
    });
    return TestBed.inject(ContextualTemplateService);
  }

  it('list() mapeia colunas snake_case → camelCase e assina a thumb', async () => {
    const [t] = await build().list();
    expect(t.id).toBe('t1');
    expect(t.name).toBe('Camisa preta');
    expect(t.storagePath).toBe('user/abc.webp');
    expect(t.sceneWidth).toBe(1600);
    expect(t.sceneHeight).toBe(1200);
    expect(t.target).toEqual({ cx: 0.5, cy: 0.4, r: 0.2, rotation: 15 });
    expect(t.createdAt).toBe('2026-07-25T10:00:00Z');
    // host reescrito p/ o supabaseUrl configurado (preserva path+query)
    expect(t.thumbUrl).toBe('https://app/obj?token=x');
  });
});
