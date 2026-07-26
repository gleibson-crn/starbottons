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
import type { EditorTransform, MockupSprite } from '../../../shared/ui';
import { applyKey, withOffset, withZoom } from '../../../shared/ui';
import type { SceneTarget } from '../scene-target';
import {
  sceneTargetToTransform,
  transformToSceneTarget,
  transformToTargetPx,
} from '../scene-target';
import { drawScenePreview } from './scene-preview-render';

const MAX_W = 560;
const MIN_W = 280;

/**
 * ScenePreview — irmão do CanvasEditor: cena FIXA de fundo e um alvo circular
 * MÓVEL (offset = posição, scale = diâmetro, rotation = rotação). Reusa
 * `editor-transform`/`editor-keymap` (shared). `role="application"` + instruções
 * de teclado via `aria-describedby`; todo gesto tem equivalente por teclado e
 * (no pai) por slider. Emite o alvo já normalizado (0..1).
 */
@Component({
  selector: 'app-scene-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './scene-preview.html',
  styleUrl: './scene-preview.scss',
})
export class ScenePreview implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly scene = input<HTMLImageElement | null>(null);
  readonly sprite = input<MockupSprite | null>(null);
  /** Alvo normalizado inicial (ex.: restaurar template) — convertido c/ as dims reais. */
  readonly seedTarget = input<SceneTarget | null>(null);
  readonly transform = model.required<EditorTransform>();
  readonly targetChange = output<SceneTarget>();

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  readonly dims = signal({ w: MAX_W, h: MAX_W });
  private dragFrom: { x: number; y: number } | null = null;
  private appliedSeed: SceneTarget | null = null;

  constructor() {
    effect(() => this.syncDims(this.scene(), this.seedTarget()));
    effect(() => this.render());
  }

  ngAfterViewInit(): void {
    this.syncDims(this.scene(), this.seedTarget());
  }

  onPointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragFrom = { x: event.clientX, y: event.clientY };
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragFrom) {
      return;
    }
    const k = this.dims().w / this.canvasRect().width;
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
    const next = applyKey(this.transform(), event.key, this.dims().w * 0.02);
    if (next) {
      event.preventDefault();
      this.transform.set(next);
    }
  }

  private syncDims(scene: HTMLImageElement | null, seed: SceneTarget | null): void {
    const avail = this.host.nativeElement.clientWidth || MAX_W;
    const w = Math.max(MIN_W, Math.min(MAX_W, avail));
    const ratio = scene ? scene.naturalHeight / scene.naturalWidth : 1;
    const h = Math.round(w * (ratio || 1));
    this.dims.set({ w, h });
    if (seed && seed !== this.appliedSeed) {
      this.appliedSeed = seed;
      this.transform.set(sceneTargetToTransform(seed, { width: w, height: h }));
    }
  }

  private canvasRect(): DOMRect {
    const el = this.canvasRef()?.nativeElement;
    const { w, h } = this.dims();
    return el ? el.getBoundingClientRect() : new DOMRect(0, 0, w, h);
  }

  private render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }
    const { w, h } = this.dims();
    this.resize(canvas, ctx, w, h);
    const t = this.transform();
    const target = transformToTargetPx(t, { width: w, height: h });
    drawScenePreview({ ctx, width: w, height: h, scene: this.scene(), sprite: this.sprite(), target });
    this.targetChange.emit(transformToSceneTarget(t, { width: w, height: h }));
  }

  private resize(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
