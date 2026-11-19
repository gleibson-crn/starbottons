/**
 * Gera o "copia e cola" do PIX (BR Code / EMV, padrão do Banco Central) para um
 * PIX ESTÁTICO sem valor definido — o doador escolhe quanto pagar.
 *
 * Tudo é montado localmente (nenhum dado sai da máquina). O QR exibido na tela
 * "Sobre" é só este texto codificado em QR, gerado no próprio navegador.
 *
 * Referência do formato: EMV MPM + manual do DICT/PIX (campos 00, 26, 52, 53,
 * 58, 59, 60, 62, 63). O campo 63 (CRC16-CCITT/FALSE) fecha o payload.
 */
export interface PixParams {
  /** Chave PIX (CPF/CNPJ só dígitos, e-mail, telefone +55… ou aleatória). */
  readonly key: string;
  /** Nome do recebedor exibido ao doador (≤25, sem acentos). */
  readonly name: string;
  /** Cidade do recebedor (≤15, sem acentos). */
  readonly city: string;
  /** Referência livre (≤25). Padrão `***` (sem identificador). */
  readonly txid?: string;
}

/** Monta um campo EMV: id (2) + tamanho (2, zero-padded) + valor. */
function field(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value;
}

/** Remove acentos e força ASCII maiúsculo (recomendação do BR Code). */
function ascii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();
}

/**
 * CRC16-CCITT (FALSE): poly 0x1021, init 0xFFFF, sem reflexão. Valor de
 * verificação canônico: CRC("123456789") === 0x29B1 (coberto por teste).
 */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Devolve o "copia e cola" PIX completo (com o CRC já calculado). */
export function pixPayload({ key, name, city, txid = '***' }: PixParams): string {
  const merchantAccount = field('26', field('00', 'br.gov.bcb.pix') + field('01', key.trim()));
  const additionalData = field('62', field('05', ascii(txid) || '***'));
  const body =
    field('00', '01') + // Payload Format Indicator
    merchantAccount + // Merchant Account Information (PIX)
    field('52', '0000') + // Merchant Category Code (não informado)
    field('53', '986') + // Moeda: BRL
    field('58', 'BR') + // País
    field('59', ascii(name).slice(0, 25)) + // Nome do recebedor
    field('60', ascii(city).slice(0, 15)) + // Cidade
    additionalData; // Dados adicionais (TXID)
  const withCrcTag = body + '6304'; // id 63 + tamanho 04 (o CRC entra a seguir)
  return withCrcTag + crc16(withCrcTag);
}
