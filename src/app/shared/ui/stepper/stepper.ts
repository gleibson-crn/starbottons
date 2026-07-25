import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface StepDef {
  readonly label: string;
}

/** Passos canônicos do fluxo (ordem fixa). */
export const WORKFLOW_STEPS: readonly StepDef[] = [
  { label: 'Upload' },
  { label: 'Modelo & Tamanho' },
  { label: 'Ajuste' },
  { label: 'Resultado' },
];

/**
 * Stepper — trilha de progresso persistente do fluxo.
 * Semântica de lista ordenada; o passo atual usa `aria-current="step"`;
 * passos concluídos recebem ✓ (ícone + texto, não só cor).
 */
@Component({
  selector: 'app-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
})
export class Stepper {
  /** Índice 0-based do passo atual. */
  readonly current = input.required<number>();
  readonly steps = WORKFLOW_STEPS;

  state(index: number): 'done' | 'current' | 'todo' {
    if (index < this.current()) {
      return 'done';
    }
    return index === this.current() ? 'current' : 'todo';
  }
}
