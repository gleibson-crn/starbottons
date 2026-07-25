/**
 * Transformação de enquadramento aplicada pela imagem no editor.
 * Este mesmo objeto é serializado em `options` da Edge Function `generate-art`,
 * garantindo que preview (Angular) e arte final (server) usem o MESMO ajuste.
 */
export interface EditorTransform {
  /** Deslocamento do centro da imagem, em px de tela do editor. */
  readonly offset: { x: number; y: number };
  /** Fator de zoom (1 = "cover" exato da arte). */
  readonly scale: number;
  /** Rotação livre em graus (−180..+180). */
  readonly rotation: number;
  /** Cor sólida de fundo para área vazia (hex, default branco). */
  readonly background: string;
}

/** Estado default seguro do editor (sem ajuste, fundo branco). */
export const DEFAULT_TRANSFORM: EditorTransform = {
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
  background: '#ffffff',
};

/** Faixa de gating de resolução do editor (semáforo). */
export type ResolutionTier = 'ok' | 'warn' | 'blocked';
