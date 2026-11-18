import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import type { UploadRecord } from '../../../shared/types';
import { DEFAULT_FILTERS } from '../../../shared/types';
import {
  CUTOUT_THRESHOLD_MAX,
  CUTOUT_THRESHOLD_MIN,
  DEFAULT_CUTOUT_THRESHOLD,
  keepMainComponents,
  runCutout,
  type CutoutStage,
} from '../../../shared/imaging';
import { loadImage } from '../../../shared/utils';
import { ModalService } from '../../../shared/ui';
import { TreatedUploadService } from '../../../core/upload';

/** Fase do fluxo: ocioso, carregando o modelo, inferindo ou recorte pronto. */
type Phase = 'idle' | 'loading' | 'running' | 'ready';

/** Origem do recorte exibido: nenhum, já salvo no item, ou recém-calculado. */
type Mode = 'none' | 'saved' | 'fresh';

/** Emitido ao PAI quando o recorte aparece/some (a prévia troca de imagem). */
export interface CutoutPanelResult {
  /** Imagem a exibir na prévia (recorte, ou a original ao desfazer). */
  readonly image: HTMLImageElement | null;
  readonly active: boolean;
}

/** Resultado do `commit()` consumido pelo `onSave` do diálogo. */
export interface CutoutCommit {
  readonly changed: boolean;
  readonly upload: UploadRecord | null;
}

const DEBOUNCE_MS = 150;

/**
 * RemoveBgPanel — "Remover fundo" (ISNet local). Recorta a(s) pessoa(s) da foto
 * ORIGINAL e deixa o resto transparente; roda 100% no navegador (Web Worker),
 * a foto NÃO sai do PC. O slider "Sensibilidade da borda" refina o corte sem
 * rodar o modelo de novo (pós-processamento puro). Prévia sobre xadrez e sobre
 * o fundo atual do botton. Falhas vão por `ModalService`.
 */
@Component({
  selector: 'app-remove-bg-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './remove-bg-panel.html',
  styleUrl: './remove-bg-panel.scss',
})
export class RemoveBgPanel implements OnInit, OnDestroy {
  private readonly modal = inject(ModalService);
  private readonly treated = inject(TreatedUploadService);

  /** Imagem ORIGINAL (crua) do item — fonte do recorte. */
  readonly sourceImage = input<HTMLImageElement | null>(null);
  readonly fileName = input.required<string>();
  /** Recorte já salvo no item (reabrir o diálogo). */
  readonly existing = input<UploadRecord | null>(null);
  /** Cor/imagem de fundo ATUAIS do botton, para a prévia "sobre o fundo". */
  readonly bottonColor = input<string>('#ffffff');
  readonly bottonImageUrl = input<string | null>(null);

  readonly resultChange = output<CutoutPanelResult>();

  readonly phase = signal<Phase>('idle');
  readonly mode = signal<Mode>('none');
  readonly threshold = signal(DEFAULT_CUTOUT_THRESHOLD);
  readonly previewUrl = signal<string | null>(null);
  readonly thresholdMin = CUTOUT_THRESHOLD_MIN;
  readonly thresholdMax = CUTOUT_THRESHOLD_MAX;

  readonly busy = computed(() => this.phase() === 'loading' || this.phase() === 'running');
  readonly percent = computed(() => Math.round((this.threshold() / 255) * 100));
  readonly canAdjust = computed(() => this.mode() === 'fresh' && !this.busy());
  readonly statusText = computed(() => {
    switch (this.phase()) {
      case 'loading':
        return 'Carregando o removedor de fundo…';
      case 'running':
        return 'Recortando a foto… pode levar alguns segundos.';
      default:
        return '';
    }
  });

  private raw: ImageData | null = null;
  private image: HTMLImageElement | null = null;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  ngOnInit(): void {
    if (this.existing()) {
      this.mode.set('saved');
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.controller?.abort();
    this.revokePreview();
  }

  /** Roda o modelo na foto original e mostra o recorte. */
  async remove(): Promise<void> {
    const src = this.sourceImage();
    if (!src || this.busy()) {
      return;
    }
    this.controller = new AbortController();
    this.phase.set('loading');
    try {
      this.raw = await runCutout(src, {
        signal: this.controller.signal,
        onStage: (s) => this.onStage(s),
      });
      this.mode.set('fresh');
      this.phase.set('ready');
      await this.render();
    } catch (err) {
      await this.onFailure(err);
    }
  }

  /** Cancela o processamento em curso. */
  cancel(): void {
    this.controller?.abort();
  }

  /** Remove o recorte e volta à foto original. */
  undo(): void {
    clearTimeout(this.timer);
    this.seq++;
    this.raw = null;
    this.image = null;
    this.revokePreview();
    this.phase.set('idle');
    this.mode.set('none');
    this.resultChange.emit({ image: this.sourceImage(), active: false });
  }

  onThreshold(value: string): void {
    this.threshold.set(Number(value));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.render(), DEBOUNCE_MS);
  }

  /**
   * Chamado pelo diálogo ao salvar: sobe o PNG do recorte (se novo) e devolve o
   * que mudou. Falha de upload avisa via modal e propaga (o diálogo não fecha).
   */
  async commit(): Promise<CutoutCommit> {
    if (this.mode() !== 'fresh' || !this.image) {
      return this.settledCommit();
    }
    try {
      const upload = await this.treated.createTreatedUpload(
        this.image,
        DEFAULT_FILTERS,
        this.fileName(),
      );
      return { changed: true, upload };
    } catch (err) {
      await this.modal.showAlert({
        title: 'Remover fundo',
        message: `Não foi possível salvar o recorte. ${err instanceof Error ? err.message : ''}`,
      });
      throw err;
    }
  }

  /** Commit SÍNCRONO quando não há recorte novo a subir (salvo/nenhum). */
  settledCommit(): CutoutCommit {
    const removed = this.mode() === 'none' && this.existing() !== null;
    return { changed: removed, upload: null };
  }

  private onStage(stage: CutoutStage): void {
    this.phase.set(stage === 'loading' ? 'loading' : 'running');
  }

  private async onFailure(err: unknown): Promise<void> {
    this.phase.set(this.raw ? 'ready' : 'idle');
    if (this.controller?.signal.aborted) {
      return;
    }
    await this.modal.showAlert({
      title: 'Remover fundo',
      message: err instanceof Error ? err.message : 'Falha ao remover o fundo.',
    });
  }

  /** Aplica o limiar + filtro de componentes e atualiza prévia/imagem. */
  private async render(): Promise<void> {
    const raw = this.raw;
    if (!raw) {
      return;
    }
    const seq = ++this.seq;
    const blob = await this.toPngBlob(keepMainComponents(raw, this.threshold()));
    if (!blob || seq !== this.seq) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    if (seq !== this.seq) {
      URL.revokeObjectURL(url);
      return;
    }
    this.revokePreview();
    this.image = img;
    this.previewUrl.set(url);
    this.resultChange.emit({ image: img, active: true });
  }

  private toPngBlob(buf: { data: Uint8ClampedArray; width: number; height: number }): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    canvas.width = buf.width;
    canvas.height = buf.height;
    const pixels = new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height);
    canvas.getContext('2d')?.putImageData(pixels, 0, 0);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.previewUrl.set(null);
  }
}
