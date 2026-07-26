/**
 * EditorPage — foco no fluxo de GERAÇÃO (Abordagem A do ADR-014):
 *  - sem filtros → NÃO reprocessa: usa o upload original (generationUpload=null);
 *  - com filtros → processa full-res + sobe NOVO upload tratado antes de gerar.
 * A Edge `generate-art` não é tocada (só recebe outro upload_id via store).
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { WorkflowStore } from '../../core/workflow';
import { TreatedUploadService } from '../../core/upload';
import { ToastService } from '../../shared/ui';
import {
  DEFAULT_FILTERS,
  DEFAULT_TRANSFORM,
  type ImageFilters,
  type PrintSpec,
  type UploadRecord,
} from '../../shared/types';
import { EditorPage } from './editor.page';

const SPEC: PrintSpec = {
  model: 'redondo',
  sizeMm: 38,
  bleedMm: 3,
  safeMm: 2,
  visibleMm: 32,
  artDiameterMm: 38,
  dpiTarget: 300,
};

const UPLOAD = {
  id: 'orig-1',
  fileName: 'foto.jpg',
  previewUrl: '',
} as UploadRecord;

const TREATED = { id: 'treated-1' } as UploadRecord;

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

interface Fakes {
  navigate: ReturnType<typeof vi.fn>;
  createTreatedUpload: ReturnType<typeof vi.fn>;
  setGenerationUpload: ReturnType<typeof vi.fn>;
  setFilters: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
}

function storeMock(f: Fakes): Partial<WorkflowStore> {
  return {
    upload: signal(UPLOAD),
    spec: signal<PrintSpec | null>(SPEC),
    transform: signal(DEFAULT_TRANSFORM),
    filters: signal<ImageFilters>(DEFAULT_FILTERS),
    hasUpload: signal(true),
    hasSelection: signal(true),
    setTransform: f.setTransform,
    setFilters: f.setFilters,
    setGenerationUpload: f.setGenerationUpload,
  } as unknown as Partial<WorkflowStore>;
}

function setup(): { page: EditorPage; f: Fakes } {
  const f: Fakes = {
    navigate: vi.fn().mockResolvedValue(true),
    createTreatedUpload: vi.fn().mockResolvedValue(TREATED),
    setGenerationUpload: vi.fn(),
    setFilters: vi.fn(),
    setTransform: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [EditorPage],
    providers: [
      { provide: WorkflowStore, useValue: storeMock(f) },
      { provide: Router, useValue: { navigate: f.navigate } },
      {
        provide: TreatedUploadService,
        useValue: { createTreatedUpload: f.createTreatedUpload },
      },
      { provide: ToastService, useValue: { error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(EditorPage);
  const page = fixture.componentInstance;
  // Imagem grande o suficiente para liberar o gating de resolução.
  page.image.set({ naturalWidth: 3000, naturalHeight: 3000 } as HTMLImageElement);
  fixture.detectChanges();
  return { page, f };
}

describe('EditorPage — geração (Abordagem A)', () => {
  it('SEM filtros não reprocessa: usa o upload original', async () => {
    const { page, f } = setup();
    await page.generate();

    expect(f.createTreatedUpload).not.toHaveBeenCalled();
    expect(f.setGenerationUpload).toHaveBeenCalledWith(null);
    expect(f.navigate).toHaveBeenCalledWith(['/app/processing']);
  });

  it('COM filtros processa full-res + novo upload antes de gerar', async () => {
    const { page, f } = setup();
    page.filters.set(VIVID);

    await page.generate();

    expect(f.createTreatedUpload).toHaveBeenCalledTimes(1);
    expect(f.createTreatedUpload).toHaveBeenCalledWith(
      page.image(),
      VIVID,
      'foto.jpg',
    );
    expect(f.setGenerationUpload).toHaveBeenCalledWith(TREATED);
    expect(f.navigate).toHaveBeenCalledWith(['/app/processing']);
    expect(page.generating()).toBe(true);
  });

  it('bloqueia geração quando a resolução é insuficiente', async () => {
    const { page, f } = setup();
    page.image.set({ naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement);
    await page.generate();
    expect(f.navigate).not.toHaveBeenCalled();
  });
});
