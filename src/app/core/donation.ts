/**
 * Dados de apoio ao projeto, num só lugar (fácil de ajustar). Usados pela tela
 * "Sobre" e pelo botão "Apoiar". O código PIX é montado localmente a partir
 * daqui (ver `pix.ts`) — nada é enviado para fora da máquina.
 */
export const DONATION = {
  /** Chave PIX do autor (CPF, só dígitos). */
  pixKey: '05389106407',
  /** Nome exibido ao doador no app PIX (sem acento, ≤25). */
  pixName: 'Gleibson CRN',
  /** Cidade do recebedor exibida no app PIX (≤15). CONFIRMAR com o autor. */
  pixCity: 'BRASIL',
  /** Página de apoio recorrente (Apoia.se). Vazio = botão recorrente oculto. */
  apoiaseUrl: '',
  /** Perfil/público do autor para créditos. */
  githubUrl: 'https://github.com/gleibson-crn',
  /** Como o autor é creditado. */
  credit: 'gleibson-crn',
} as const;
