import {
  ChangeDetectionStrategy,
  Component,
  computed,
  model,
} from '@angular/core';

/** Branco puro — cor de fundo default do botton. */
export const WHITE_BG = '#ffffff';

/** Resultado do `EyeDropper.open()` (subconjunto usado). */
interface EyeDropperResult {
  readonly sRGBHex: string;
}

/** Construtor da EyeDropper API (nem todo navegador expõe). */
type EyeDropperCtor = new () => { open(): Promise<EyeDropperResult> };

/** Lê o construtor da EyeDropper API do `window`, se existir. */
function eyeDropperCtor(): EyeDropperCtor | undefined {
  return (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
}

/**
 * BackgroundPicker — escolhe a COR DE FUNDO sólida do botton (camada sob a
 * imagem; PNG transparente passa a mostrar esta cor). Estágio 1: só cor sólida
 * + conta-gotas. A seção "Fundo" é o lugar preparado para receber imagem/
 * template no Estágio 2. Acessibilidade: o `<input type="color">` tem `<label>`
 * associado por `for`/`id`; o valor atual é anunciado como texto (swatch + hex,
 * não só cor); o conta-gotas some (feature-detect) quando o navegador não
 * suporta a EyeDropper API, exibindo aviso textual; foco visível herda o
 * `:focus-visible` global; alvos de toque ≥44px via `.btn`/`--tap-min`.
 */
@Component({
  selector: 'app-background-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './background-picker.html',
  styleUrl: './background-picker.scss',
})
export class BackgroundPicker {
  /** Cor de fundo (hex). Two-way com o `transform().background` do diálogo. */
  readonly color = model.required<string>();

  /** `true` quando o navegador expõe a EyeDropper API (feature-detect). */
  readonly supportsEyeDropper = eyeDropperCtor() !== undefined;

  /** `true` quando o fundo já é branco (desabilita "Restaurar branco"). */
  readonly isWhite = computed(
    () => this.color().toLowerCase() === WHITE_BG,
  );

  /** Aplica a cor escolhida no `<input type="color">`. */
  onColorInput(value: string): void {
    this.color.set(value);
  }

  /** Abre o conta-gotas; aplica a cor amostrada. Cancelamento é ignorado. */
  async pickWithEyeDropper(): Promise<void> {
    const ctor = eyeDropperCtor();
    if (!ctor) {
      return;
    }
    try {
      const { sRGBHex } = await new ctor().open();
      this.color.set(sRGBHex);
    } catch {
      // open() rejeita quando o usuário fecha/cancela — comportamento normal.
    }
  }

  /** Volta o fundo para branco (default). */
  restoreWhite(): void {
    this.color.set(WHITE_BG);
  }
}
