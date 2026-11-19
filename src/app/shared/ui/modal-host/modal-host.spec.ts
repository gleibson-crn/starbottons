import { TestBed } from '@angular/core/testing';
import { ModalHost } from './modal-host';
import { ModalService } from './modal.service';

function setup(): { svc: ModalService; root: HTMLElement; flush: () => Promise<void> } {
  // jsdom/happy-dom podem não implementar <dialog>.showModal/close.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  const fixture = TestBed.createComponent(ModalHost);
  const svc = TestBed.inject(ModalService);
  const flush = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { svc, root: fixture.nativeElement as HTMLElement, flush };
}

describe('ModalHost', () => {
  it('não renderiza nada sem modal ativo', async () => {
    const { root, flush } = setup();
    await flush();
    expect(root.querySelector('dialog')).toBeNull();
  });

  it('renderiza <dialog> com título, mensagem e botões', async () => {
    const { svc, root, flush } = setup();
    void svc.showConfirm({ title: 'Apagar?', message: 'Tem certeza', danger: true });
    await flush();
    const dlg = root.querySelector('dialog')!;
    expect(dlg.getAttribute('aria-labelledby')).toBe('modal-title');
    expect(root.querySelector('#modal-title')?.textContent).toBe('Apagar?');
    expect(root.querySelector('#modal-message')?.textContent).toBe('Tem certeza');
    expect(root.querySelectorAll('button')).toHaveLength(2);
    expect(root.querySelector('.btn--danger')).not.toBeNull();
  });

  it('clicar num botão resolve com o valor da escolha', async () => {
    const { svc, root, flush } = setup();
    const p = svc.showConfirm({ title: 't', message: 'm' });
    await flush();
    root.querySelectorAll('button')[1].click();
    expect(await p).toBe(true);
  });

  it('Esc (evento cancel) cancela', async () => {
    const { svc, root, flush } = setup();
    const p = svc.showChoices({
      title: 't',
      choices: [{ value: 1, label: 'Um', variant: 'primary' }],
    });
    await flush();
    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await p).toBeNull();
  });

  it('clique no backdrop (alvo = próprio dialog) cancela', async () => {
    const { svc, root, flush } = setup();
    const p = svc.showConfirm({ title: 't', message: 'm' });
    await flush();
    root.querySelector('dialog')!.click();
    expect(await p).toBe(false);
  });

  it('dismissible:false — Esc e backdrop NÃO fecham; só botão resolve', async () => {
    const { svc, root, flush } = setup();
    const p = svc.showChoices({
      title: 'Atualizar?',
      dismissible: false,
      choices: [
        { value: 'now', label: 'Agora', variant: 'primary' },
        { value: 'later', label: 'Depois', variant: 'secondary' },
      ],
    });
    await flush();
    // Esc: ignorado — modal segue ativo.
    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(svc.active()).not.toBeNull();
    // Backdrop: ignorado — modal segue ativo.
    root.querySelector('dialog')!.click();
    expect(svc.active()).not.toBeNull();
    // Só o botão resolve.
    root.querySelectorAll('button')[0].click();
    expect(await p).toBe('now');
  });

  it('foco inicial vai a um botão seguro, nunca ao destrutivo', async () => {
    const { svc, root, flush } = setup();
    document.body.appendChild(root);
    void svc.showConfirm({ title: 't', message: 'm', danger: true, confirmLabel: 'Apagar' });
    await flush();
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.textContent?.trim()).toBe('Cancelar');
    root.remove();
  });
});
