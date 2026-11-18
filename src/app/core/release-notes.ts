/** Nota de release em linguagem do dono (não técnica). */
export interface ReleaseNote {
  readonly version: string;
  readonly date: string;
  readonly notes: readonly string[];
}

/** Versão corrente do app (semver). Incrementar a cada release. */
export const APP_VERSION = '1.1.0';

/** Notas de release, em qualquer ordem (o serviço ordena por versão). */
export const RELEASES: readonly ReleaseNote[] = [
  {
    version: '1.1.0',
    date: '2026-11-18',
    notes: [
      'Remover fundo: agora dá para recortar a pessoa da foto e tirar o fundo, direto no navegador.',
      'Login automático: o sistema abre direto, sem pedir senha.',
      'Botão Sair: desliga tudo de forma limpa ao fechar o sistema.',
      'Instalação em 1 comando: instalar o Star Bottons ficou simples.',
    ],
  },
];
