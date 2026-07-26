/**
 * UploadPage — dropzone UNIFICADO (1 vs N arquivos).
 *
 * O valor da tela é rotear pela quantidade sem regredir o fluxo single: uma
 * imagem segue probe/preview + Continuar (→/app/selection); duas ou mais
 * acumulam no BatchStore e navegam para /app/batch; rejeições viram toast.
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { UploadService } from '../../core/upload';
import { ToastService } from '../../shared/ui';
import { BatchStore } from '../../core/batch';
import { UploadPage } from './upload.page';

const PROBE = { width: 800, height: 800, previewUrl: 'blob:preview' };

function pngFile(name = 'a.png'): File {
  return new File([new Uint8Array([1])], name, { type: 'image/png' });
}

interface Fakes {
  probe: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  addFiles: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  setUpload: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
}

function setup(addFilesReturn: string[] = []): { page: UploadPage; f: Fakes } {
  const f: Fakes = {
    probe: vi.fn().mockResolvedValue(PROBE),
    upload: vi.fn().mockResolvedValue({ id: 'up-1' }),
    addFiles: vi.fn().mockReturnValue(addFilesReturn),
    navigate: vi.fn().mockResolvedValue(true),
    setUpload: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [UploadPage],
    providers: [
      { provide: UploadService, useValue: { probe: f.probe, upload: f.upload } },
      { provide: WorkflowStore, useValue: { setUpload: f.setUpload } },
      { provide: BatchStore, useValue: { addFiles: f.addFiles } },
      { provide: Router, useValue: { navigate: f.navigate } },
      { provide: ToastService, useValue: { error: f.error, warning: f.warning } },
    ],
  });
  const page = TestBed.createComponent(UploadPage).componentInstance;
  return { page, f };
}

describe('UploadPage — dropzone unificado', () => {
  it('1 arquivo segue o fluxo single (probe/preview, sem lote)', async () => {
    const { page, f } = setup();
    await page.onFilesAccepted([pngFile()]);
    expect(f.probe).toHaveBeenCalledTimes(1);
    expect(page.probe()).toEqual(PROBE);
    expect(f.addFiles).not.toHaveBeenCalled();
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it('Continuar (single) faz upload e navega para /app/selection', async () => {
    const { page, f } = setup();
    await page.onFilesAccepted([pngFile()]);
    await page.continue();
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(f.setUpload).toHaveBeenCalledWith({ id: 'up-1' });
    expect(f.navigate).toHaveBeenCalledWith(['/app/selection']);
  });

  it('2+ arquivos acumulam no BatchStore e navegam para /app/batch', async () => {
    const { page, f } = setup();
    const files = [pngFile('a.png'), pngFile('b.png')];
    await page.onFilesAccepted(files);
    expect(f.addFiles).toHaveBeenCalledWith(files);
    expect(f.navigate).toHaveBeenCalledWith(['/app/batch']);
    expect(f.probe).not.toHaveBeenCalled();
    expect(page.probe()).toBeNull();
  });

  it('avisa (toast) sobre recusas de overflow do lote', async () => {
    const { page, f } = setup(['b.png: limite atingido.']);
    await page.onFilesAccepted([pngFile('a.png'), pngFile('b.png')]);
    expect(f.warning).toHaveBeenCalledWith('b.png: limite atingido.');
  });

  it('rejeição de arquivo emite toast de erro por item', () => {
    const { page, f } = setup();
    page.onFilesRejected([
      { name: 'x.gif', reason: 'Formato inválido. Envie PNG ou JPEG.' },
    ]);
    expect(f.error).toHaveBeenCalledWith(
      'x.gif: Formato inválido. Envie PNG ou JPEG.',
    );
  });
});
