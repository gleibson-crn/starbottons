import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  FRAME_RASTERIZER,
  FrameTemplateService,
  type CompositionLayer,
  type FrameTemplate,
} from '../../../core/frames';
import { UploadService } from '../../../core/upload';
import { FrameComposer } from './frame-composer';

const TPL: FrameTemplate = {
  id: 'f1',
  name: 'Borda',
  storagePath: 'u/borda.png',
  mime: 'image/png',
  width: 1000,
  height: 1000,
  createdAt: '2026-08-20T10:00:00Z',
  thumbUrl: 'https://app/borda.png',
  defaultFraming: { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
  isComposite: false,
};
const LIB: FrameTemplate = { ...TPL, id: 'f9', name: 'Estrelas', storagePath: 'u/estrelas.png' };

const L0: CompositionLayer = {
  id: 'l0',
  storagePath: 'frame-layers/a.png',
  url: 'https://app/a.png',
  offset: { x: 0.1, y: -0.05 },
  scale: 1.5,
  rotation: 10,
  source: 'upload',
  originTemplateId: null,
};
const L1: CompositionLayer = {
  ...L0,
  id: 'l1',
  storagePath: 'frame-layers/b.png',
  url: 'https://app/b.png',
  source: 'template',
  originTemplateId: 'f9',
};

describe('FrameComposer', () => {
  const listLayers = vi.fn();
  const copyPng = vi.fn();
  const signThumb = vi.fn();
  const saveComposition = vi.fn();
  const upload = vi.fn();
  const rasterize = vi.fn();
  const flat = new Blob(['png'], { type: 'image/png' });

  async function build(layers: CompositionLayer[] = [L0, L1]) {
    listLayers.mockReset().mockResolvedValue(layers);
    copyPng.mockReset().mockResolvedValue('frame-layers/new.png');
    signThumb.mockReset().mockResolvedValue('https://app/new.png');
    saveComposition.mockReset().mockResolvedValue({ ...TPL, isComposite: true });
    upload.mockReset().mockResolvedValue({ path: 'up/x.png', previewUrl: 'https://app/x.png' });
    rasterize.mockReset().mockResolvedValue(flat);
    TestBed.configureTestingModule({
      providers: [
        { provide: FRAME_RASTERIZER, useValue: rasterize },
        {
          provide: FrameTemplateService,
          useValue: { listLayers, copyPng, signThumb, saveComposition },
        },
        { provide: UploadService, useValue: { probe: vi.fn(async () => ({})), upload } },
      ],
    });
    const fixture = TestBed.createComponent(FrameComposer);
    fixture.componentRef.setInput('template', TPL);
    fixture.componentRef.setInput('library', [LIB]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.canvas()!.side.set(400);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, cmp: fixture.componentInstance };
  }

  it('carrega as camadas salvas e denormaliza pelo lado do canvas', async () => {
    const { cmp } = await build();
    expect(listLayers).toHaveBeenCalledWith('f1');
    expect(cmp.frames.refs().map((r) => r.path)).toEqual([L0.storagePath, L1.storagePath]);
    expect(cmp.frames.refs()[1].id).toBe('f9');
    const f = cmp.frames.framings()[0];
    expect(f.offset.x).toBeCloseTo(40);
    expect(f.offset.y).toBeCloseTo(-20);
    expect(f.scale).toBe(1.5);
    expect(f.rotation).toBe(10);
  });

  it('adiciona via moldura cadastrada: copyPng + camada NEUTRA com originTemplateId', async () => {
    const { cmp } = await build([L0]);
    await cmp.addFromLibrary(LIB);
    expect(copyPng).toHaveBeenCalledWith('u/estrelas.png');
    expect(signThumb).toHaveBeenCalledWith('frame-layers/new.png');
    const r = cmp.frames.refs()[1];
    expect(r.path).toBe('frame-layers/new.png');
    expect(r.id).toBe('f9');
    expect(r.source).toBe('template');
    expect(r.offset).toEqual({ x: 0, y: 0 });
    expect(r.scale).toBe(1);
  });

  it('erro no copyPng aparece em role=alert e nao empilha', async () => {
    const { fixture, cmp } = await build([L0]);
    copyPng.mockRejectedValueOnce(new Error('Falha ao copiar a moldura: x'));
    await cmp.addFromLibrary(LIB);
    fixture.detectChanges();
    expect(cmp.frames.refs().length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Falha ao copiar',
    );
  });

  it('adiciona via upload (PNG) delegando ao FrameLayers.addUpload', async () => {
    const { cmp } = await build([L0]);
    const add = vi.spyOn(cmp.frames, 'addUpload').mockResolvedValue();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await cmp.onFile(file);
    expect(add).toHaveBeenCalledWith(file);
  });

  it('reordena e remove camadas', async () => {
    const { cmp } = await build();
    cmp.moveUp(0);
    expect(cmp.frames.refs().map((r) => r.path)).toEqual([L1.storagePath, L0.storagePath]);
    cmp.moveDown(1);
    expect(cmp.frames.refs()[0].path).toBe(L0.storagePath);
    cmp.remove(0);
    expect(cmp.frames.refs().map((r) => r.path)).toEqual([L1.storagePath]);
  });

  it('teto de 8: desabilita adicionar e esconde a dropzone', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      ...L0,
      id: `l${i}`,
      storagePath: `p${i}`,
    }));
    const { fixture, cmp } = await build(eight);
    fixture.detectChanges();
    expect(cmp.frames.canAdd()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-file-dropzone')).toBeNull();
    const libBtn = fixture.nativeElement.querySelector('.fcomp__lib button') as HTMLButtonElement;
    expect(libBtn.disabled).toBe(true);
    await cmp.addFromLibrary(LIB);
    expect(copyPng).not.toHaveBeenCalled();
  });

  it('salvar normaliza os offsets, rasteriza e chama saveComposition', async () => {
    const { cmp } = await build();
    const saved = vi.fn();
    cmp.saved.subscribe(saved);
    cmp.onFramingChange({
      index: 0,
      framing: { offset: { x: 40, y: -20 }, scale: 1.5, rotation: 5 },
    });
    await cmp.save();
    const [id, inputs, blob] = saveComposition.mock.calls[0];
    expect(id).toBe('f1');
    expect(blob).toBe(flat);
    expect(inputs[0]).toEqual({
      storagePath: L0.storagePath,
      offset: { x: 0.1, y: -0.05 },
      scale: 1.5,
      rotation: 5,
      source: 'upload',
      originTemplateId: null,
    });
    expect(inputs[1]).toMatchObject({
      source: 'template',
      originTemplateId: 'f9',
      storagePath: L1.storagePath,
    });
    const [els, framings, side] = rasterize.mock.calls[0];
    expect(els.length).toBe(2);
    expect(framings[0].offset).toEqual({ x: 0.1, y: -0.05 });
    expect(side).toBe(1000);
    expect(saved).toHaveBeenCalledWith({ ...TPL, isComposite: true });
  });

  it('salvar sem camadas mostra erro e nao chama o servico', async () => {
    const { fixture, cmp } = await build([]);
    await cmp.save();
    fixture.detectChanges();
    expect(saveComposition).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('1 a 8');
  });

  it('falha no saveComposition vira role=alert', async () => {
    const { fixture, cmp } = await build();
    saveComposition.mockRejectedValueOnce(new Error('boom'));
    await cmp.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('boom');
  });
});
