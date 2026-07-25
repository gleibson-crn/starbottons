/**
 * Falha definitiva da geração (ex.: job `failed`). Diferente de erros
 * transitórios (rede, timeout), NÃO deve ser retentada — reenviar o mesmo
 * enquadramento não mudaria o resultado.
 */
export class TerminalGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalGenerationError';
  }
}
