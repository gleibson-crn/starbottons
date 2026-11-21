import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { RemoveBgPanel, type CutoutPanelResult } from '../../batch/remove-bg-panel/remove-bg-panel';

/**
 * FrameBgEditor — painel "Remover fundo" para uma MOLDURA JÁ ADICIONADA. Reusa o
 * mesmo `RemoveBgPanel` do lote (botão "✂ Remover fundo", prévia e "Sensibilidade
 * da borda") sobre a imagem da moldura e, ao "Aplicar recorte", devolve o PNG sem
 * fundo para o chamador trocar a imagem da moldura. Recorte 100% local (ISNet).
 */
@Component({
  selector: 'app-frame-bg-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RemoveBgPanel],
  templateUrl: './frame-bg-editor.html',
  styleUrl: './frame-bg-editor.scss',
})
export class FrameBgEditor {
  /** Imagem ATUAL da moldura (fonte do recorte). */
  readonly image = input<HTMLImageElement | null>(null);
  readonly fileName = input<string>('moldura.png');
  /** `true` enquanto o chamador sobe/aplica o recorte (desabilita os botões). */
  readonly applying = input<boolean>(false);

  /** Recorte aplicado: PNG sem fundo para substituir a moldura. */
  readonly applied = output<File>();
  readonly cancelled = output<void>();

  /** Recorte ativo vindo do painel (ou `null` = nada a aplicar ainda). */
  readonly cutout = signal<HTMLImageElement | null>(null);
  readonly canApply = computed(() => this.cutout() !== null && !this.applying());

  /** Resultado do painel: guarda o recorte quando ativo. */
  onCutout(result: CutoutPanelResult): void {
    this.cutout.set(result.active ? result.image : null);
  }

  /** Rasteriza o recorte em PNG e emite para o chamador aplicar na moldura. */
  async apply(): Promise<void> {
    const cut = this.cutout();
    if (!cut || this.applying()) {
      return;
    }
    this.applied.emit(await this.imageToPngFile(cut, this.fileName()));
  }

  cancel(): void {
    this.cancelled.emit();
  }

  /** Rasteriza a imagem do recorte em um `File` PNG (preserva transparência). */
  private imageToPngFile(img: HTMLImageElement, name: string): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    const base = name.replace(/\.[^.]+$/, '') || 'moldura';
    return new Promise<File>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(new File([blob], `${base}.png`, { type: 'image/png' }))
            : reject(new Error('Falha ao gerar o PNG.')),
        'image/png',
      ),
    );
  }
}
