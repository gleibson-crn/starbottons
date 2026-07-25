/**
 * Validação client-side do upload (AC de Upload + F-003).
 *
 * O valor do produto é "não desperdiçar impressão" — o caminho de ERRO
 * (rejeição) é o mais importante. Cobre: MIME não-PNG/JPEG rejeitado, tamanho
 * acima do teto rejeitado, formatos válidos aceitos (incluindo o limite) e o
 * sniffing de MAGIC BYTES (F-003): um arquivo com `type` forjado mas conteúdo
 * que não é PNG/JPEG é barrado no client (a Edge revalida server-side).
 */
import { TestBed } from '@angular/core/testing';
import { FileDropzone } from './file-dropzone';

const MB = 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
const NOT_IMAGE = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/** Cria um File com bytes-cabeçalho reais e um tamanho arbitrário. */
function fileWith(name: string, type: string, bytes: number, head: number[] = []): File {
  const file = new File([new Uint8Array(head)], name, { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

/** Dispara a validação (assíncrona) e resolve com o resultado emitido. */
function submit(
  component: FileDropzone,
  file: File,
): Promise<{ accepted: File | null; rejected: string | null }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted: File | null, rejected: string | null): void => {
      if (!settled) {
        settled = true;
        resolve({ accepted, rejected });
      }
    };
    component.fileAccepted.subscribe((f) => finish(f, null));
    component.fileRejected.subscribe((m) => finish(null, m));
    const input = { files: [file], value: 'x' } as unknown as HTMLInputElement;
    component.onInputChange({ target: input } as unknown as Event);
  });
}

function createDropzone(): FileDropzone {
  TestBed.configureTestingModule({ imports: [FileDropzone] });
  return TestBed.createComponent(FileDropzone).componentInstance;
}

describe('FileDropzone — validação de upload', () => {
  it('aceita PNG dentro do limite (com assinatura válida)', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('a.png', 'image/png', 2 * MB, PNG_MAGIC),
    );
    expect(rejected).toBeNull();
    expect(accepted).not.toBeNull();
  });

  it('aceita JPEG dentro do limite (com assinatura válida)', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('a.jpg', 'image/jpeg', 2 * MB, JPEG_MAGIC),
    );
    expect(rejected).toBeNull();
    expect(accepted).not.toBeNull();
  });

  it('rejeita MIME não suportado (ex.: GIF) com mensagem de formato', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('a.gif', 'image/gif', 1 * MB, PNG_MAGIC),
    );
    expect(accepted).toBeNull();
    expect(rejected).toBe('Formato inválido. Envie PNG ou JPEG.');
  });

  it('rejeita WebP na origem (ADR-002: nunca WebP como fonte)', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('a.webp', 'image/webp', 1 * MB),
    );
    expect(accepted).toBeNull();
    expect(rejected).toBe('Formato inválido. Envie PNG ou JPEG.');
  });

  it('rejeita PDF disfarçado por MIME', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('a.pdf', 'application/pdf', 1 * MB),
    );
    expect(accepted).toBeNull();
    expect(rejected).toBe('Formato inválido. Envie PNG ou JPEG.');
  });

  it('F-003: rejeita PNG forjado (type png, conteúdo não-imagem)', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('fake.png', 'image/png', 2 * MB, NOT_IMAGE),
    );
    expect(accepted).toBeNull();
    expect(rejected).toBe('O conteúdo do arquivo não parece uma imagem PNG/JPEG válida.');
  });

  it('rejeita arquivo acima de 25 MB', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('big.png', 'image/png', 26 * MB, PNG_MAGIC),
    );
    expect(accepted).toBeNull();
    expect(rejected).toBe('Arquivo muito grande (máx. 25 MB).');
  });

  it('aceita arquivo exatamente no teto de 25 MB', async () => {
    const { accepted, rejected } = await submit(
      createDropzone(),
      fileWith('edge.png', 'image/png', 25 * MB, PNG_MAGIC),
    );
    expect(rejected).toBeNull();
    expect(accepted).not.toBeNull();
  });
});
