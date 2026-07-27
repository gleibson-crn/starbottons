import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  OnInit,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import type {
  EditorTransform,
  ImageFilters,
  PrintSpec,
} from '../../../shared/types';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../../shared/types';
import {
  BackgroundPicker,
  CanvasEditor,
  ResolutionBadge,
  TreatPanel,
} from '../../../shared/ui';
import { effectiveDpi, fallbackSpec, loadImage, rovingNext } from '../../../shared/utils';
import { largestSelectedSize, type BatchItem } from '../../../core/batch';

/** Ajuste salvo pelo diálogo (vale p/ todos os tamanhos da imagem). */
export interface BatchEditResult {
  readonly transform: EditorTransform;
  readonly editorSide: number;
  readonly filters: ImageFilters;
}

/** Aba do painel do diálogo. */
type TabId = 'adjust' | 'treat' | 'background';

interface EditorTab {
  readonly id: TabId;
  readonly label: string;
}

const EDITOR_TABS: readonly EditorTab[] = [
  { id: 'adjust', label: 'Ajustar' },
  { id: 'treat', label: 'Tratar' },
  { id: 'background', label: 'Fundo' },
];

/**
 * BatchEditorDialog — modal de UMA imagem do lote com abas ARIA "Ajustar |
 * Tratar". Ajustar = CanvasEditor de enquadramento (spec do MAIOR tamanho
 * selecionado); Tratar = TreatPanel (presets + sliders). O canvas recebe
 * `[filters]` para refletir o tratamento ao vivo. Acessibilidade:
 * `role="dialog"` + `aria-modal`, Esc fecha, `role="tablist"` com navegação
 * ←/→/Home/End; ao confirmar devolve transform + filters (todos os tamanhos).
 * A aba "Fundo" (BackgroundPicker) edita `transform.background` (cor sólida sob
 * a imagem), refletida ao vivo pelo canvas.
 */
@Component({
  selector: 'app-batch-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasEditor, ResolutionBadge, TreatPanel, BackgroundPicker],
  host: { '(keydown)': 'onKeydown($event)' },
  templateUrl: './batch-editor-dialog.html',
  styleUrl: './batch-editor-dialog.scss',
})
export class BatchEditorDialog implements OnInit {
  readonly item = input.required<BatchItem>();
  readonly saved = output<BatchEditResult>();
  readonly closed = output<void>();

  readonly image = signal<HTMLImageElement | null>(null);
  readonly transform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  readonly filters = signal<ImageFilters>(DEFAULT_FILTERS);
  private readonly canvas = viewChild(CanvasEditor);

  readonly tabs = EDITOR_TABS;
  readonly activeTab = signal<TabId>('adjust');
  private readonly tabButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  readonly spec = computed<PrintSpec>(() => {
    const size = largestSelectedSize(this.item()) ?? 58;
    const spec = fallbackSpec('round', size);
    if (!spec) {
      throw new Error(`Sem print_spec para ${size}mm.`);
    }
    return spec;
  });

  readonly dpi = computed(() => {
    const img = this.image();
    if (!img) {
      return 0;
    }
    return effectiveDpi({
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      scale: this.transform().scale,
      spec: this.spec(),
    });
  });

  ngOnInit(): void {
    this.transform.set(this.item().transform);
    this.filters.set(this.item().filters);
    void this.hydrate();
  }

  selectTab(id: TabId): void {
    this.activeTab.set(id);
  }

  /** Troca a cor de fundo (aba "Fundo"); o preview reflete ao vivo. */
  onBackground(color: string): void {
    this.transform.update((t) => ({ ...t, background: color }));
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

  onSave(): void {
    this.saved.emit({
      transform: this.transform(),
      editorSide: this.canvas()?.side() ?? this.item().editorSide,
      filters: this.filters(),
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.onClose();
    }
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

  private async hydrate(): Promise<void> {
    this.image.set(await loadImage(this.item().previewUrl));
  }
}
