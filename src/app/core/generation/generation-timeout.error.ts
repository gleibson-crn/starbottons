/**
 * Erro sinalizando que a chamada síncrona à `generate-art` excedeu o limite
 * (8s no MVP) — o serviço então cai para o polling de `generation_jobs`.
 */
export class GenerationTimeoutError extends Error {
  constructor() {
    super('A geração síncrona expirou; alternando para acompanhamento.');
    this.name = 'GenerationTimeoutError';
  }
}
