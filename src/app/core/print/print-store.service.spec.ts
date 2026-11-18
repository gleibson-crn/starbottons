/**
 * PrintStore — a fila da folha de impressão. Começa VAZIA; `enqueue` soma a
 * quantidade quando a mesma `key` reaparece (e revoga o blob duplicado);
 * `remove`/`clear` revogam os object URLs; `setQuantity` limita em 1..999.
 */
import { TestBed } from '@angular/core/testing';
import { PrintStore } from './print-store.service';
import type { SheetLine } from './sheet-line';

function line(patch: Partial<SheetLine> = {}): SheetLine {
  return {
    key: 'a:44',
    url: 'blob:a44',
    name: 'Logo',
    sizeMm: 44,
    quantity: 1,
    origin: 'ready',
    ...patch,
  };
}

describe('PrintStore', () => {
  let store: PrintStore;
  let revoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    revoke = vi.fn();
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
    TestBed.configureTestingModule({});
    store = TestBed.inject(PrintStore);
  });

  it('começa vazia', () => {
    expect(store.queue()).toEqual([]);
  });

  it('enqueue adiciona uma linha nova', () => {
    store.enqueue(line());
    expect(store.queue()).toHaveLength(1);
    expect(store.queue()[0].key).toBe('a:44');
  });

  it('enqueue da mesma key SOMA a quantidade e mantém o blob enfileirado', () => {
    store.enqueue(line({ quantity: 2 }));
    store.enqueue(line({ url: 'blob:novo', quantity: 3 }));
    expect(store.queue()).toHaveLength(1);
    expect(store.queue()[0].quantity).toBe(5);
    // Mantém o object URL já enfileirado e revoga o duplicado recém-criado.
    expect(store.queue()[0].url).toBe('blob:a44');
    expect(revoke).toHaveBeenCalledWith('blob:novo');
  });

  it('enqueue soma respeitando o teto de 999', () => {
    store.enqueue(line({ quantity: 998 }));
    store.enqueue(line({ url: 'blob:x', quantity: 5 }));
    expect(store.queue()[0].quantity).toBe(999);
  });

  it('keys diferentes coexistem como linhas separadas', () => {
    store.enqueue(line({ key: 'a:44', url: 'blob:1' }));
    store.enqueue(line({ key: 'a:58', url: 'blob:2', sizeMm: 58 }));
    expect(store.queue().map((l) => l.key)).toEqual(['a:44', 'a:58']);
  });

  it('remove tira a linha e revoga seu object URL', () => {
    store.enqueue(line());
    store.remove('a:44');
    expect(store.queue()).toEqual([]);
    expect(revoke).toHaveBeenCalledWith('blob:a44');
  });

  it('remove ignora URLs que não são blob:', () => {
    store.enqueue(line({ url: 'https://cdn/x.png' }));
    store.remove('a:44');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('clear esvazia e revoga todos os object URLs', () => {
    store.enqueue(line({ key: 'a', url: 'blob:1' }));
    store.enqueue(line({ key: 'b', url: 'blob:2' }));
    store.clear();
    expect(store.queue()).toEqual([]);
    expect(revoke).toHaveBeenCalledWith('blob:1');
    expect(revoke).toHaveBeenCalledWith('blob:2');
  });

  it('setQuantity redefine e limita ao intervalo válido', () => {
    store.enqueue(line());
    store.setQuantity('a:44', 7);
    expect(store.queue()[0].quantity).toBe(7);
    store.setQuantity('a:44', 0);
    expect(store.queue()[0].quantity).toBe(1);
    store.setQuantity('a:44', 5000);
    expect(store.queue()[0].quantity).toBe(999);
  });
});
