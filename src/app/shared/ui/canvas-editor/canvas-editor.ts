import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type {
  EditorTransform,
  Framing,
  ImageFilters,
  PrintSpec,
  StyleEffect,
} from '../../types';
import {
  DEFAULT_BACKGROUND_FRAMING,
  DEFAULT_FILTERS,
  DEFAULT_STYLE_EFFECT,
  isDefaultStyle,
} from '../../types';
import { prepareArt, type PreparedArt } from '../../imaging';
import { computeLayout, imageDrawSize, isBleedCovered } from '../../utils';
import { applyKey } from './editor-keymap';
import { drawBottonFace, type FrameLayer } from './botton-face';
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
  /**
   * Molduras decorativas já carregadas, EMPILHADAS por CIMA da arte na ordem do
   * array (z-order). Entradas `null` (ainda carregando) são ignoradas no
   * desenho; os índices permanecem alinhados a `frameFramings`/`activeFrameIndex`.
   */
  readonly frameImages = input<readonly (HTMLImageElement | null)[]>([]);
  /**
   * Enquadramento de CADA moldura (alinhado por índice a `frameImages`). One-way:
   * os gestos na camada `'frame'` NÃO mutam aqui; emitem `frameFramingChange` com
   * o índice + novo enquadramento e o pai persiste (fonte única = `transform`).
   */
  readonly frameFramings = input<readonly Framing[]>([]);
  /** Gesto moveu/escalou/girou a moldura ATIVA: índice + novo enquadramento. */
  readonly frameFramingChange = output<{ index: number; framing: Framing }>();
  /**
   * Índice da moldura ATIVA (alvo dos gestos na camada `'frame'`). `-1` = nenhuma
   * (gestos inertes). Definido pela seleção na lista de camadas da aba Moldura.
   */
  readonly activeFrameIndex = input<number>(-1);
  readonly spec = input.required<PrintSpec>();
  readonly transform = model.required<EditorTransform>();
  /** Filtros aplicados só à imagem no preview (paralelo ao transform). */
  readonly filters = input<ImageFilters | null>(null);
  /**
   * Efeito de estilo por pixel (ADR-019). `none` (default) mantém o caminho
   * tonal atual (`ctx.filter`) intocado; qualquer outro estilo é baked por
   * `prepareArt` num canvas MEMOIZADO por (image, filters, style, side) — assim
   * arrastar/zoom/girar NÃO recomputam o pixel pass, só o `drawImage`.
   */
  readonly style = input<StyleEffect>(DEFAULT_STYLE_EFFECT);
  /**
   * Camada-alvo dos gestos: `'art'` (padrão) muta o `transform`; `'background'`
   * muta o `backgroundTransform` (quando não-nulo), reusando as MESMAS funções
   * de gesto. `'frame'` = aba Moldura ativa: a moldura é COVER fixo (sem gestos),
   * então os gestos ficam INERTES (não movem a arte por engano). Permite
   * reposicionar o fundo pela prévia sem sair da arte.
   */
  readonly layer = input<'art' | 'background' | 'frame'>('art');
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

  /**
   * Arte pronta para composição, MEMOIZADA por (image, filters, style, side).
   * Sem estilo → devolve a própria imagem (caminho tonal via `ctx.filter`). Com
   * estilo → o pixel pass roda SÍNCRONO (preview ≤520px) e só reexecuta quando
   * uma dessas chaves muda; gestos de enquadramento não a invalidam.
   */
  private readonly prepared = computed<PreparedArt | null>(() => {
    const img = this.image();
    if (!img || isDefaultStyle(this.style())) {
      return img;
    }
    return prepareArt(img, this.filters() ?? DEFAULT_FILTERS, this.style(), this.side());
  });

  constructor() {
    effect(() => this.render());
  }

  ngAfterViewInit(): void {
    const width = this.host.nativeElement.clientWidth || MAX_SIDE;
    this.side.set(Math.max(MIN_SIDE, Math.min(MAX_SIDE, width)));
  }

  /**
   * Snapshot da FACE limpa (sem guias/escurecimento) num canvas offscreen
   * `outSize`×`outSize`, recortado ao círculo de sangria — para uma prévia
   * externa (ex.: card do lote). Reusa a MESMA composição do editor
   * (`drawBottonFace`); os offsets são escalados de `side()` para `outSize`.
   * Devolve um dataURL PNG, ou `null` em ambiente sem canvas (ex.: testes jsdom).
   */
  faceSnapshot(outSize = 192): string | null {
    try {
      const spec = this.spec();
      const off = document.createElement('canvas');
      off.width = outSize;
      off.height = outSize;
      const ctx = off.getContext('2d');
      if (!ctx || !spec) {
        return null;
      }
      this.paintFace(ctx, spec, outSize);
      return off.toDataURL('image/png');
    } catch {
      return null; // canvas indisponível (jsdom) ou toDataURL não implementado
    }
  }

  /**
   * Pinta a face limpa no contexto dado, recortada na LINHA DE CORTE (sem a
   * sangria): dá zoom para o círculo de corte (`cutR`) preencher a prévia — é o
   * que o cliente enxerga no botton acabado.
   */
  private paintFace(ctx: CanvasRenderingContext2D, spec: PrintSpec, outSize: number): void {
    const layout = computeLayout(spec, outSize);
    const t = this.transform();
    const size = this.drawSize(this.image(), layout.bleedR * 2, t.scale);
    const bgImg = this.backgroundImage();
    const bgT = this.backgroundTransform();
    const bgSize = this.drawSize(bgImg, layout.bleedR * 2, bgT?.scale ?? 1);
    const c = outSize / 2;
    const zoom = c / layout.cutR; // corte → preenche a prévia (sangria cortada)
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(c, c);
    ctx.scale(zoom, zoom);
    ctx.translate(-c, -c);
    drawBottonFace({
      ctx,
      side: outSize,
      layout,
      image: this.prepared(),
      transform: t,
      filters: this.artFilters(),
      backgroundImage: bgImg,
      backgroundTransform: bgT,
      bgDrawW: bgSize.drawW,
      bgDrawH: bgSize.drawH,
      frames: this.buildFrames(),
      editorSide: this.side(),
      ...size,
    });
    ctx.restore();
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
    // Aba Moldura: os gestos movem/escalam/giram a moldura ATIVA (selecionada na
    // lista). Sem moldura ativa (índice fora de faixa) → inerte (não mexe na arte).
    if (this.layer() === 'frame') {
      return this.mutateActiveFrame(fn);
    }
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

  /**
   * Muta o enquadramento da moldura ATIVA (`activeFrameIndex`) com a MESMA função
   * de gesto; escreve de volta no `frameFramings` (two-way → o diálogo persiste
   * no `EditorTransform.frameImages`). Fora de faixa (nenhuma ativa) → no-op.
   */
  private mutateActiveFrame(fn: (t: Framing) => Framing | null): boolean {
    const i = this.activeFrameIndex();
    const framings = this.frameFramings();
    if (i < 0 || i >= framings.length) {
      return false;
    }
    const next = fn(framings[i] ?? DEFAULT_BACKGROUND_FRAMING);
    if (!next) {
      return false;
    }
    this.frameFramingChange.emit({ index: i, framing: next });
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
    // O tamanho de desenho deriva SEMPRE da imagem ORIGINAL (o canvas estilizado
    // mantém o mesmo aspecto, então escala igual). Com estilo, `filters` é
    // OMITIDO — o tonal já está baked em `prepared`.
    const size = this.drawSize(img, layout.bleedR * 2, t.scale);
    const bgImg = this.backgroundImage();
    const bgT = this.backgroundTransform();
    const bgSize = this.drawSize(bgImg, layout.bleedR * 2, bgT?.scale ?? 1);
    drawScene({
      ctx,
      side,
      layout,
      image: this.prepared(),
      transform: t,
      filters: this.artFilters(),
      backgroundImage: bgImg,
      backgroundTransform: bgT,
      bgDrawW: bgSize.drawW,
      bgDrawH: bgSize.drawH,
      frames: this.buildFrames(),
      ...size,
    });
    this.coverageChange.emit(
      img ? isBleedCovered({ transform: t, ...size, bleedR: layout.bleedR }) : false,
    );
  }

  /**
   * Molduras EMPILHADAS (z-order = ordem do array), cada uma com seu
   * enquadramento; o COVER no círculo VISÍVEL (cutR) é calculado em botton-face.
   * Entradas `null` (ainda carregando) são puladas, mantendo o alinhamento.
   */
  private buildFrames(): FrameLayer[] {
    const framings = this.frameFramings();
    const frames: FrameLayer[] = [];
    this.frameImages().forEach((frameImg, i) => {
      if (frameImg) {
        frames.push({ image: frameImg, framing: framings[i] });
      }
    });
    return frames;
  }

  /**
   * Filtros tonais para o `drawScene`: OMITIDOS quando há estilo (o tonal já
   * foi baked em `prepared` por `prepareArt`, para não reaplicar via ctx.filter).
   */
  private artFilters(): ImageFilters | undefined {
    if (!isDefaultStyle(this.style())) {
      return undefined;
    }
    return this.filters() ?? undefined;
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
