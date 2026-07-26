import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { TreatedUploadService } from '../../core/upload';
import { CanvasEditor, ResolutionBadge, ToastService } from '../../shared/ui';
import type { EditorTransform, ImageFilters } from '../../shared/types';
import { isDefaultFilters } from '../../shared/types';
import {
  canGenerateAtDpi,
  effectiveDpi,
  loadImage,
  rovingNext,
} from '../../shared/utils';
import { EditorControls } from './editor-controls';
import { TreatPanel } from './treat-panel';

/** Aba do painel lateral do editor. */
type TabId = 'adjust' | 'treat';

interface EditorTab {
  readonly id: TabId;
  readonly label: string;
}

const EDITOR_TABS: readonly EditorTab[] = [
  { id: 'adjust', label: 'Ajustar' },
  { id: 'treat', label: 'Tratar' },
];

/**
 * EditorPage — passo 3 (ajuste + tratamento). Reúne o canvas, um painel com
 * abas ARIA "Ajustar | Tratar", o badge de resolução e o gating de "Gerar".
 * Preserva enquadramento e filtros no store. Abordagem A (ADR-014): com filtros,
 * gera um PNG full-res tratado e o sobe como NOVO upload antes de `generate-art`.
 */
@Component({
  selector: 'app-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasEditor, EditorControls, TreatPanel, ResolutionBadge],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.scss',
})
export class EditorPage {
  private readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);
  private readonly treated = inject(TreatedUploadService);
  private readonly toast = inject(ToastService);

  readonly upload = this.store.upload;
  readonly spec = this.store.spec;
  readonly image = signal<HTMLImageElement | null>(null);
  readonly transform = signal<EditorTransform>(this.store.transform());
  readonly filters = signal<ImageFilters>(this.store.filters());
  readonly bleedCovered = signal(true);
  readonly generating = signal(false);

  readonly tabs = EDITOR_TABS;
  readonly activeTab = signal<TabId>('adjust');
  private readonly tabButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  private readonly canvas = viewChild(CanvasEditor);
  readonly dpi = computed(() => this.computeDpi());
  readonly canGenerate = computed(() => canGenerateAtDpi(this.dpi()));

  constructor() {
    if (!this.store.hasUpload()) {
      void this.router.navigate(['/app/upload']);
      return;
    }
    if (!this.store.hasSelection()) {
      void this.router.navigate(['/app/selection']);
      return;
    }
    void this.hydrateImage();
  }

  onCoverage(covered: boolean): void {
    this.bleedCovered.set(covered);
  }

  selectTab(id: TabId): void {
    this.activeTab.set(id);
  }

  /** Navegação ARIA por teclado (←/→/Home/End) com ativação automática. */
  onTabKeydown(event: KeyboardEvent): void {
    const current = this.tabIndex();
    const next = this.nextTabIndex(event, current);
    if (next === current) {
      return;
    }
    event.preventDefault();
    this.activeTab.set(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  async generate(): Promise<void> {
    if (!this.canGenerate() || this.generating()) {
      return;
    }
    this.persist();
    if (isDefaultFilters(this.filters())) {
      this.store.setGenerationUpload(null);
      await this.router.navigate(['/app/processing']);
      return;
    }
    await this.generateTreated();
  }

  async back(): Promise<void> {
    this.persist();
    await this.router.navigate(['/app/selection']);
  }

  /** Abordagem A: processa full-res + sobe novo upload tratado, então gera. */
  private async generateTreated(): Promise<void> {
    const image = this.image();
    const upload = this.store.upload();
    if (!image || !upload) {
      return;
    }
    this.generating.set(true);
    try {
      const record = await this.treated.createTreatedUpload(
        image,
        this.filters(),
        upload.fileName,
      );
      this.store.setGenerationUpload(record);
      await this.router.navigate(['/app/processing']);
    } catch (err) {
      this.generating.set(false);
      this.toast.error((err as Error).message);
    }
  }

  private persist(): void {
    this.store.setTransform(this.transform(), this.canvas()?.side());
    this.store.setFilters(this.filters());
  }

  private tabIndex(): number {
    return this.tabs.findIndex((t) => t.id === this.activeTab());
  }

  private nextTabIndex(event: KeyboardEvent, current: number): number {
    if (event.key === 'Home') {
      return 0;
    }
    if (event.key === 'End') {
      return this.tabs.length - 1;
    }
    return rovingNext(this.tabs.length, current, event.key, () => true);
  }

  private computeDpi(): number {
    const img = this.image();
    const spec = this.spec();
    if (!img || !spec) {
      return 0;
    }
    return effectiveDpi({
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      scale: this.transform().scale,
      spec,
    });
  }

  private async hydrateImage(): Promise<void> {
    const url = this.store.upload()?.previewUrl;
    if (url) {
      this.image.set(await loadImage(url));
    }
  }
}
