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
import type { EditorTransform, Framing, ImageFilters, PrintSpec } from '../../types';
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
  /** Imagem de fundo já carregada (COVER fixo sob a arte); `null` = só cor. */
  readonly backgroundImage = input<HTMLImageElement | null>(null);
  readonly spec = input.required<PrintSpec>();
  readonly transform = model.required<EditorTransform>();
  /** Filtros aplicados só à imagem no preview (paralelo ao transform). */
  readonly filters = input<ImageFilters | null>(null);
  /**
   * Camada-alvo dos gestos: `'art'` (padrão) muta o `transform`; `'background'`
   * muta o `backgroundTransform` (quando não-nulo), reusando as MESMAS funções
   * de gesto. Permite reposicionar o fundo pela prévia sem sair da arte.
   */
  readonly layer = input<'art' | 'background'>('art');
  /**
   * Enquadramento do fundo (posição/zoom/rotação). `null` = sem imagem de fundo
   * (gestos caem sempre na arte). Two-way: os gestos na camada `'background'`
   * atualizam este model.
   */
  readonly backgroundTransform = model<Framing | null>(null);
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
    this.mutate((t) => withOffset(t, dx, dy));
  }

  onPointerUp(): void {
    this.dragFrom = null;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    this.mutate((t) => withZoom(t, factor));
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.mutate((t) => applyKey(t, event.key, this.side() * 0.02))) {
      event.preventDefault();
    }
  }

  /** `true` quando os gestos devem atuar sobre o fundo (não a arte). */
  private bgActive(): boolean {
    return this.layer() === 'background' && this.backgroundTransform() !== null;
  }

  /**
   * Aplica uma mutação de enquadramento à camada ativa: fundo (`bgActive`) ou
   * arte. Retorna `true` se algo mudou (a mutação pode devolver `null`, ex.:
   * tecla não reconhecida). As MESMAS funções servem às duas camadas.
   */
  private mutate(fn: (t: Framing) => Framing | null): boolean {
    if (this.bgActive()) {
      const next = fn(this.backgroundTransform() as Framing);
      if (!next) {
        return false;
      }
      this.backgroundTransform.set(next);
      return true;
    }
    const next = fn(this.transform());
    if (!next) {
      return false;
    }
    this.transform.set(next as EditorTransform);
    return true;
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
    const bgImg = this.backgroundImage();
    const bgT = this.backgroundTransform();
    const bgSize = this.drawSize(bgImg, layout.bleedR * 2, bgT?.scale ?? 1);
    drawScene({
      ctx,
      side,
      layout,
      image: img,
      transform: t,
      filters: this.filters() ?? undefined,
      backgroundImage: bgImg,
      backgroundTransform: bgT,
      bgDrawW: bgSize.drawW,
      bgDrawH: bgSize.drawH,
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
