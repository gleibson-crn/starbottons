/**
 * UploadPage — lista acumulável com fluxo único no "Continuar".
 *
 * O valor da tela é deixar o usuário revisar/remover antes de prosseguir:
 * novos arquivos são ANEXADOS (não substituem), cada um pode ser removido
 * (revogando o object URL), e o "Continuar" envia SEMPRE todos os itens
 * (1..N) ao BatchStore e navega para o grid (/app/batch). O teto MAX_IMAGES
 * é respeitado e as recusas viram toast.
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UploadService } from '../../core/upload';
import { ToastService } from '../../shared/ui';
import { BatchStore, MAX_IMAGES } from '../../core/batch';
import { UploadPage } from './upload.page';

const PROBE = { width: 800, height: 800, previewUrl: 'blob:preview' };

function pngFile(name = 'a.png'): File {
  return new File([new Uint8Array([1])], name, { type: 'image/png' });
}

interface Fakes {
  probe: ReturnType<typeof vi.fn>;
  addFiles: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
}

function setup(addFilesReturn: string[] = []): { page: UploadPage; f: Fakes } {
  const f: Fakes = {
    probe: vi.fn().mockResolvedValue(PROBE),
    addFiles: vi.fn().mockReturnValue(addFilesReturn),
    navigate: vi.fn().mockResolvedValue(true),
    error: vi.fn(),
    warning: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [UploadPage],
    providers: [
      { provide: UploadService, useValue: { probe: f.probe } },
      { provide: BatchStore, useValue: { addFiles: f.addFiles } },
      { provide: Router, useValue: { navigate: f.navigate } },
      { provide: ToastService, useValue: { error: f.error, warning: f.warning } },
    ],
  });
  const page = TestBed.createComponent(UploadPage).componentInstance;
  return { page, f };
}

describe('UploadPage — lista acumulável (fluxo único)', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('anexa (não substitui) ao adicionar mais arquivos', async () => {
    const { page, f } = setup();
    await page.onFilesAccepted([pngFile('a.png')]);
    await page.onFilesAccepted([pngFile('b.png')]);
    expect(page.items().length).toBe(2);
    expect(page.items()[0].file.name).toBe('a.png');
    expect(page.items()[1].file.name).toBe('b.png');
    expect(f.probe).toHaveBeenCalledTimes(2);
  });

  it('soltar 2+ de uma vez apenas acumula na lista (sem navegar)', async () => {
    const { page, f } = setup();
    await page.onFilesAccepted([pngFile('a.png'), pngFile('b.png')]);
    expect(page.items().length).toBe(2);
    expect(f.addFiles).not.toHaveBeenCalled();
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it('remover tira o item da lista e revoga o object URL', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { page } = setup();
    await page.onFilesAccepted([pngFile('a.png')]);
    page.remove(0);
    expect(page.items().length).toBe(0);
    expect(revoke).toHaveBeenCalledWith(PROBE.previewUrl);
  });

  it('Continuar com 1 item envia ao BatchStore e navega para /app/batch', async () => {
    const { page, f } = setup();
    await page.onFilesAccepted([pngFile()]);
    await page.continue();
    expect(f.addFiles).toHaveBeenCalledTimes(1);
    expect(f.addFiles.mock.calls[0][0]).toHaveLength(1);
    expect(f.navigate).toHaveBeenCalledWith(['/app/batch']);
  });

  it('Continuar com 2+ itens envia ao BatchStore e navega para /app/batch', async () => {
    const { page, f } = setup();
    await page.onFilesAccepted([pngFile('a.png'), pngFile('b.png')]);
    await page.continue();
    expect(f.addFiles).toHaveBeenCalledTimes(1);
    expect(f.addFiles.mock.calls[0][0]).toHaveLength(2);
    expect(f.navigate).toHaveBeenCalledWith(['/app/batch']);
  });

  it('Continuar sem itens não envia nem navega', async () => {
    const { page, f } = setup();
    await page.continue();
    expect(f.addFiles).not.toHaveBeenCalled();
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it('o rótulo do botão de busca muda conforme a contagem', async () => {
    const { page } = setup();
    expect(page.browseLabel()).toBe('Procurar arquivo');
    await page.onFilesAccepted([pngFile()]);
    expect(page.browseLabel()).toBe('Adicionar arquivo');
  });

  it('respeita o teto MAX_IMAGES e avisa o excedente', async () => {
    const { page, f } = setup();
    const many = Array.from({ length: MAX_IMAGES + 1 }, (_, i) =>
      pngFile(`f${i}.png`),
    );
    await page.onFilesAccepted(many);
    expect(page.items().length).toBe(MAX_IMAGES);
    expect(f.warning).toHaveBeenCalledTimes(1);
  });

  it('avisa (toast) sobre recusas de overflow do lote ao Continuar', async () => {
    const { page, f } = setup(['b.png: limite atingido.']);
    await page.onFilesAccepted([pngFile('a.png'), pngFile('b.png')]);
    await page.continue();
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
