import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ModalService, ToastService } from '../../../shared/ui';
import { BatchStore, EventTallyService, type BottonSize } from '../../../core/batch';
import { PrintStore } from '../../../core/print';
import { BatchProgress } from '../batch-progress/batch-progress';
import { BatchImageCard } from '../batch-image-card/batch-image-card';
import type { BatchEditResult } from '../batch-editor-dialog/batch-editor-dialog';

/**
 * BatchGrid — página do LOTE. Toolbar (progresso + ações) e a grade de cartões.
 * A entrada de imagens é feita só na tela de upload (fluxo único); aqui não há
 * mais dropzone. Reusa o BatchStore para todo o estado. Uma região
 * `aria-live=polite` anuncia o progresso agregado a leitores de tela.
 */
@Component({
  selector: 'app-batch-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BatchProgress,
    BatchImageCard,
  ],
  templateUrl: './batch-grid.html',
  styleUrl: './batch-grid.scss',
})
export class BatchGrid {
  readonly store = inject(BatchStore);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(ModalService);
  readonly tally = inject(EventTallyService);
  private readonly router = inject(Router);
  private readonly printStore = inject(PrintStore);

  readonly items = this.store.items;
  readonly numbered = this.store.numbered;
  readonly totalArtes = this.store.totalArtes;
  readonly artesProntas = this.store.artesProntas;
  readonly artesGerando = this.store.artesGerando;
  readonly artesFalhas = this.store.artesFalhas;
  readonly podeGerar = this.store.podeGerar;
  readonly generating = this.store.generating;
  readonly capped = this.store.capped;
  readonly nameMissing = this.store.nameMissing;
  readonly seqMissing = this.store.seqMissing;
  readonly duplicates = this.store.duplicateSeqLabels;
  readonly remaining = this.store.remainingArtes;
  readonly itemsSemTamanho = this.store.itemsSemTamanho;
  readonly zipping = signal(false);

  readonly hasItems = computed(() => this.items().length > 0);
  readonly hasReady = computed(() => this.artesProntas() > 0);
  /** Nº de artes já enfileiradas para impressão (mostra o botão "Impressão (N)"). */
  readonly printCount = computed(() => this.printStore.queue().length);
  readonly liveStatus = computed(
    () => `${this.artesProntas()} de ${this.totalArtes()} artes prontas`,
  );

  generate(): void {
    void this.store.generateAll();
  }

  /** Vai à folha de impressão com as artes já adicionadas pelos cartões. */
  goToPrint(): void {
    void this.router.navigate(['/app/impressao']);
  }

  cancel(): void {
    this.store.cancel();
  }

  async downloadZip(): Promise<void> {
    if (this.zipping()) {
      return;
    }
    this.zipping.set(true);
    try {
      const result = await this.store.exportZip();
      this.reportZip(result.zipped, result.skippedFailures);
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.zipping.set(false);
    }
  }

  onToggle(id: string, size: BottonSize): void {
    this.store.toggleSize(id, size);
  }

  onRemove(id: string): void {
    this.store.removeItem(id);
  }

  onName(id: string, name: string): void {
    this.store.setName(id, name);
  }

  onSeq(id: string, value: string): void {
    this.store.setSeqLabel(id, value);
  }

  async resetTally(): Promise<void> {
    const ok = await this.modal.showConfirm({
      title: 'Zerar contador do evento?',
      message: `Isso apaga a contagem de ${this.tally.count()} botton(s) produzidos neste evento.`,
      confirmLabel: 'Zerar',
      danger: true,
    });
    if (ok) {
      this.tally.clear();
    }
  }

  onTransform(id: string, result: BatchEditResult): void {
    this.store.setTransform(id, result.transform, result.editorSide);
    if (result.cutoutChanged) {
      this.store.setItemCutout(id, result.cutoutUpload ?? null);
    }
    this.store.setItemFilters(id, result.filters);
    this.store.setItemStyle(id, result.style);
    // Trilha 2 (ADR-021): por ÚLTIMO — setItemFilters/setItemStyle resetam
    // aiStyled; a estilização por IA (upload já materializado) vem depois.
    if (result.aiStyled && result.generationUpload) {
      this.store.setItemAiStyle(id, result.generationUpload);
    }
  }

  onRetry(id: string): void {
    void this.store.retryItem(id);
  }

  onReupload(id: string): void {
    void this.store.retryUpload(id);
  }

  onApplyScene(id: string): void {
    void this.router.navigate(['/app/mockup', id]);
  }

  private reportZip(zipped: number, skipped: number): void {
    if (zipped === 0) {
      this.toast.error('Nenhuma arte pronta para baixar.');
      return;
    }
    this.toast.success(`ZIP com ${zipped} arquivo(s) gerado.`);
    if (skipped > 0) {
      this.toast.warning(`${skipped} arte(s) com falha ficaram de fora do ZIP.`);
    }
  }
}
