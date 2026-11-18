import { TestBed } from '@angular/core/testing';
import { ModalService } from './modal.service';

describe('ModalService', () => {
  let svc: ModalService;

  beforeEach(() => {
    svc = TestBed.inject(ModalService);
  });

  it('showConfirm resolve true ao confirmar e false ao cancelar', async () => {
    const yes = svc.showConfirm({ title: 't', message: 'm' });
    expect(svc.active()?.choices.map((c) => c.label)).toEqual(['Cancelar', 'Confirmar']);
    svc.close(true);
    expect(await yes).toBe(true);

    const no = svc.showConfirm({ title: 't', message: 'm' });
    svc.close(svc.active()?.cancelValue); // Esc / backdrop
    expect(await no).toBe(false);
  });

  it('showConfirm danger usa variante danger e rótulos customizados', () => {
    void svc.showConfirm({
      title: 't',
      message: 'm',
      danger: true,
      confirmLabel: 'Apagar',
      cancelLabel: 'Voltar',
    });
    const [cancel, ok] = svc.active()!.choices;
    expect(cancel.label).toBe('Voltar');
    expect(ok).toMatchObject({ label: 'Apagar', variant: 'danger' });
  });

  it('showAlert resolve ao fechar (inclusive via cancel)', async () => {
    const p = svc.showAlert({ title: 'Aviso', message: 'x' });
    svc.close(svc.active()?.cancelValue);
    await expect(p).resolves.toBeUndefined();
  });

  it('showChoices resolve o valor escolhido ou null se cancelado', async () => {
    const opts = {
      title: 't',
      choices: [
        { value: 'a' as const, label: 'A', variant: 'primary' as const },
        { value: 'b' as const, label: 'B', variant: 'danger' as const },
      ],
    };
    const picked = svc.showChoices(opts);
    svc.close('b');
    expect(await picked).toBe('b');

    const cancelled = svc.showChoices(opts);
    svc.close(svc.active()?.cancelValue);
    expect(await cancelled).toBeNull();
  });

  it('enfileira: um modal ativo por vez, FIFO', async () => {
    const first = svc.showConfirm({ title: '1', message: '' });
    const second = svc.showConfirm({ title: '2', message: '' });
    expect(svc.active()?.title).toBe('1');
    svc.close(true);
    expect(svc.active()?.title).toBe('2');
    svc.close(false);
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(svc.active()).toBeNull();
  });
});
