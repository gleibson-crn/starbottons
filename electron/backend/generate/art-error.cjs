// Erro de domínio da geração com status associado (portado de types.ts).
// No backend local não há HTTP, mas o `status` é preservado para paridade de
// semântica (400=entrada inválida, 422=excede teto) e logs.
class ArtError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ArtError';
    this.status = status;
  }
}

module.exports = { ArtError };
