import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { EditorTransform, ImageFilters, PrintSpec } from '../../types';
import { computeLayout, imageDrawSize, isBleedCovered } from '../../utils';
import { applyKey } from './editor-keymap';
import { drawScene } from './editor-render';
import { withOffset, withZoom } from './editor-transform';

const MAX_SIDE = 520;
const MIN_SIDE = 280;

/**
 * CanvasEditor — canvas interativo de ajuste manual (arrastar, zoom pela roda,
 * rotação/zoom por teclado). É `role="application"`, focável, com instruções
 * de teclado via `aria-describedby`. Reporta cobertura de sangria ao pai.
 */
@Component({
  selector: 'app-canvas-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './canvas-editor.html',
  styleUrl: './canvas-editor.scss',
})
export class CanvasEditor implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly image = input<HTMLImageElement | null>(null);
  readonly spec = input.required<PrintSpec>();
  readonly transform = model.required<EditorTransform>();
  /** Filtros aplicados só à imagem no preview (paralelo ao transform). */
  readonly filters = input<ImageFilters | null>(null);
  readonly coverageChange = output<boolean>();

  private readonly canvasRef =
    viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  readonly side = signal(MAX_SIDE);
  private dragFrom: { x: number; y: number } | null = null;

  constructor() {
    effect(() => this.render());
  }

  ngAfterViewInit(): void {
    const width = this.host.nativeElement.clientWidth || MAX_SIDE;
    this.side.set(Math.max(MIN_SIDE, Math.min(MAX_SIDE, width)));
  }

  onPointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragFrom = { x: event.clientX, y: event.clientY };
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragFrom) {
      return;
    }
    const k = this.side() / this.canvasRect().width;
    const dx = (event.clientX - this.dragFrom.x) * k;
    const dy = (event.clientY - this.dragFrom.y) * k;
    this.dragFrom = { x: event.clientX, y: event.clientY };
    this.transform.update((t) => withOffset(t, dx, dy));
  }

  onPointerUp(): void {
    this.dragFrom = null;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    this.transform.update((t) => withZoom(t, factor));
  }

  onKeydown(event: KeyboardEvent): void {
    const next = applyKey(this.transform(), event.key, this.side() * 0.02);
    if (next) {
      event.preventDefault();
      this.transform.set(next);
    }
  }

  private canvasRect(): DOMRect {
    const el = this.canvasRef()?.nativeElement;
    return el ? el.getBoundingClientRect() : new DOMRect(0, 0, this.side(), this.side());
  }

  private render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const spec = this.spec();
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !spec) {
      return;
    }
    const side = this.side();
    this.resize(canvas, ctx, side);
    const layout = computeLayout(spec, side);
    const t = this.transform();
    const img = this.image();
    const size = this.drawSize(img, layout.bleedR * 2, t.scale);
    drawScene({
      ctx,
      side,
      layout,
      image: img,
      transform: t,
      filters: this.filters() ?? undefined,
      ...size,
    });
    this.coverageChange.emit(
      img ? isBleedCovered({ transform: t, ...size, bleedR: layout.bleedR }) : false,
    );
  }

  private drawSize(
    img: HTMLImageElement | null,
    bleedDiameter: number,
    scale: number,
  ): { drawW: number; drawH: number } {
    if (!img) {
      return { drawW: 0, drawH: 0 };
    }
    return imageDrawSize(img.naturalWidth, img.naturalHeight, bleedDiameter, scale);
  }

  private resize(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    side: number,
  ): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = side * dpr;
    canvas.height = side * dpr;
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
