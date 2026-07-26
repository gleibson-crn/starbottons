import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { SceneTemplate } from '../contextual-template.service';

/** Estilo inline (percentuais) do marcador do alvo sobre a thumbnail. */
interface MarkerStyle {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
}

/**
 * TemplateCard — cartão de um template: thumbnail assinado com o marcador do
 * alvo sobreposto e ações Usar/Excluir. Se a imagem falhar (ex.: URL expirada
 * ou 404), mostra um estado de erro acessível em vez da imagem quebrada.
 */
@Component({
  selector: 'app-template-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './template-card.html',
  styleUrl: './template-card.scss',
})
export class TemplateCard {
  readonly template = input.required<SceneTemplate>();
  readonly use = output<SceneTemplate>();
  readonly remove = output<SceneTemplate>();

  readonly failed = signal(false);

  readonly marker = computed<MarkerStyle>(() => this.markerStyle());

  onError(): void {
    this.failed.set(true);
  }

  onUse(): void {
    this.use.emit(this.template());
  }

  onRemove(): void {
    this.remove.emit(this.template());
  }

  private markerStyle(): MarkerStyle {
    const t = this.template();
    const minSide = Math.min(t.sceneWidth, t.sceneHeight) || 1;
    const diaW = ((2 * t.target.r * minSide) / (t.sceneWidth || 1)) * 100;
    const diaH = ((2 * t.target.r * minSide) / (t.sceneHeight || 1)) * 100;
    return {
      left: `${t.target.cx * 100}%`,
      top: `${t.target.cy * 100}%`,
      width: `${diaW}%`,
      height: `${diaH}%`,
    };
  }
}
