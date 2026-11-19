import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import * as QRCode from 'qrcode';
import { APP_VERSION } from '../../core/app-version';
import { DONATION } from '../../core/donation';
import { pixPayload } from '../../core/pix';
import { ToastService } from '../../shared/ui';

/** Apoiador exibido na Parede de Apoiadores. */
export interface Supporter {
  readonly name: string;
  readonly tier?: string;
}

/**
 * SobrePage — tela "Sobre / Apoiar". Conta o que é o projeto (grátis, mantido
 * pelo autor), reforça a licença (uso livre, revenda proibida) e oferece as
 * formas de apoio: PIX (chave + copia-e-cola + QR gerado LOCALMENTE) e apoio
 * recorrente (Apoia.se). Nenhum dado sai da máquina — o QR é só o "copia e
 * cola" do PIX codificado aqui mesmo.
 */
@Component({
  selector: 'app-sobre-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sobre.page.html',
  styleUrl: './sobre.page.scss',
})
export class SobrePage implements OnInit {
  private readonly toast = inject(ToastService);
  protected readonly version = APP_VERSION;
  protected readonly donation = DONATION;
  /** "Copia e cola" do PIX (BR Code) — montado localmente. */
  protected readonly pixCode = pixPayload({
    key: DONATION.pixKey,
    name: DONATION.pixName,
    city: DONATION.pixCity,
  });
  /** Data URL do QR (ou `null` se a geração falhar — chave/texto seguem úteis). */
  protected readonly qr = signal<string | null>(null);
  /** Apoiadores exibidos na "Parede de Apoiadores" (vazio = estado "em breve"). */
  protected readonly supporters = signal<readonly Supporter[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      this.qr.set(await QRCode.toDataURL(this.pixCode, { margin: 1, width: 240 }));
    } catch {
      this.qr.set(null);
    }
    this.supporters.set(await this.loadSupporters());
  }

  /** Busca a lista (URL pública se houver; senão o arquivo embutido). Best-effort. */
  private async loadSupporters(): Promise<readonly Supporter[]> {
    const url = this.donation.supportersUrl || '/supporters.json';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        return [];
      }
      const data = JSON.parse(await res.text()) as { supporters?: unknown };
      const list = Array.isArray(data.supporters) ? data.supporters : [];
      return list
        .map((s) => s as { name?: unknown; tier?: unknown })
        .filter((s): s is Supporter => typeof s.name === 'string' && s.name.trim() !== '')
        .map((s) => ({ name: String(s.name), tier: typeof s.tier === 'string' ? s.tier : undefined }));
    } catch {
      return []; // offline, repo privado, JSON inválido: mostra o estado "em breve"
    }
  }

  async copy(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(`${label} copiado.`);
    } catch {
      this.toast.error('Não foi possível copiar — selecione e copie manualmente.');
    }
  }
}
