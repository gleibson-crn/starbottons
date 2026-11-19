/** Nota de release em linguagem do dono (não técnica). */
export interface ReleaseNote {
  readonly version: string;
  readonly date: string;
  readonly notes: readonly string[];
}

export { APP_VERSION } from './app-version';

/** Notas de release, em qualquer ordem (o serviço ordena por versão). */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.2.4',
    date: '2026-11-19',
    notes: [
      'Ajustes na tela de apoio (Sobre): chave PIX de doação atualizada.',
    ],
  },
  {
    version: '1.2.3',
    date: '2026-11-19',
    notes: [
      'Agora dá para apoiar o Star Bottons todo mês pelo Apoia.se: botão "♥ Apoiar todo mês" na tela "Sobre".',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-11-19',
    notes: [
      'O menu do topo agora fica fixo ao rolar a tela — a navegação fica sempre à mão.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-11-19',
    notes: [
      'Parede de Apoiadores na tela "Sobre": um espaço para agradecer quem ajuda a manter o projeto no ar.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-19',
    notes: [
      'Nova tela "Sobre" e botão "♥ Apoiar" no topo: o Star Bottons é grátis — veja como contribuir (PIX) para manter o projeto no ar e recebendo melhorias.',
    ],
  },
  {
    version: '1.1.5',
    date: '2026-11-19',
    notes: [
      'Botão "Atualização disponível" no topo: se o aviso de atualização fechar, é só clicar nele para abrir de novo.',
    ],
  },
  {
    version: '1.1.4',
    date: '2026-11-19',
    notes: [
      'Teste do "Atualizar agora" de ponta a ponta — sem mudança de funcionalidade.',
    ],
  },
  {
    version: '1.1.3',
    date: '2026-11-19',
    notes: [
      'Tela de carregamento: ao abrir pelo atalho, aparece na hora uma tela "Iniciando…" com barra de progresso, até o sistema ficar pronto.',
      'Aviso de atualização agora só fecha ao escolher "Atualizar agora" ou "Depois" — não some mais por um clique fora.',
    ],
  },
  {
    version: '1.1.2',
    date: '2026-11-19',
    notes: [
      'Teste do pop-up de atualização ao vivo — sem mudança de funcionalidade.',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-11-18',
    notes: [
      'Primeira atualização automática de verificação — testa o novo sistema de updates do Star Bottons.',
      'Ajustes internos de manutenção.',
    ],
  },
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

/** Alias retrocompatível. */
export const RELEASES = RELEASE_NOTES;
