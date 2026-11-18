import type {
  StyleOption,
  StyleProvider,
  StyleTransferRequest,
  StyleTransferResult,
} from './style-provider';

/**
 * Provedor NO-OP (ADR-020). Existe só como stub de testes e placeholder de
 * contrato: não é configurado, não lista estilos e falha ao aplicar. NÃO é
 * registrado no boot. Nunca faz rede — apenas satisfaz a interface.
 */
export class NullStyleProvider implements StyleProvider {
  readonly id = 'null';
  readonly displayName = 'Nenhum (desligado)';
  readonly requiresNetwork = true as const;

  isConfigured(): boolean {
    return false;
  }

  async listStyles(): Promise<readonly StyleOption[]> {
    return [];
  }

  // Assinatura do contrato exige o parâmetro (callers passam o pedido); o stub
  // não o usa — apenas rejeita. Nunca faz rede.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async apply(_req: StyleTransferRequest): Promise<StyleTransferResult> {
    throw new Error('Style transfer não configurado (Trilha 2 desligada — ver ADR-020).');
  }
}
