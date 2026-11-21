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
    version: '1.2.15',
    date: '2026-11-21',
    notes: [
      'Remover fundo agora também nas molduras: depois de adicionar a moldura, use o botão ✂ (na lista de molduras do editor de bottons e do montador de camadas, ou na prévia ao cadastrar) para abrir o mesmo painel "Remover fundo" do lote — com prévia e ajuste de borda — e aplicar o recorte naquela moldura. Ótimo para molduras geradas por IA que vêm com fundo. Roda 100% no seu computador, sem custo e sem internet.',
    ],
  },
  {
    version: '1.2.14',
    date: '2026-11-21',
    notes: [
      'Impressão já começa numa impressora de verdade: ao abrir a tela de impressão, o sistema pula as impressoras virtuais (OneNote, "Imprimir em PDF", XPS, Fax) e já seleciona uma impressora física — nada de cair no OneNote por engano.',
    ],
  },
  {
    version: '1.2.13',
    date: '2026-11-21',
    notes: [
      'Impressão com pré-visualização dentro do app: ao clicar em "Imprimir", agora aparece uma tela mostrando a folha A4 exatamente como vai sair, onde você escolhe a impressora e o número de cópias e imprime — sem o diálogo do Windows (que não mostrava a prévia).',
      'Configurações avançadas de impressão: na mesma tela há o botão "⚙ Configurações avançadas", que abre as opções da sua impressora (tipo de papel, qualidade, cor) — essenciais para quem faz personalizados. O que você ajustar fica salvo e é usado na impressão.',
    ],
  },
  {
    version: '1.2.12',
    date: '2026-11-20',
    notes: [
      'Impressão corrigida: o botão "Imprimir" agora abre direto o diálogo da impressora do Windows (escolher impressora e imprimir no papel), sem abrir o leitor de PDF. Quem ainda quiser gerar um PDF é só escolher "Microsoft Print to PDF" na lista de impressoras.',
    ],
  },
  {
    version: '1.2.11',
    date: '2026-11-20',
    notes: [
      'Tela de envio de imagens mais organizada: a prévia dos bottons fica em grade (3 por linha, todos do mesmo tamanho), o nome do arquivo ocupa no máximo 2 linhas, e o aviso de "resolução baixa" virou um símbolo discreto — a mensagem aparece ao passar o mouse ou clicar.',
      'Visual padronizado nas telas de Curadoria (mockups, fundos e molduras) e na Impressão: título com a cor da marca, descrição e área de envio ocupando a largura toda, e removida a barra cinza repetida no topo.',
    ],
  },
  {
    version: '1.2.10',
    date: '2026-11-20',
    notes: [
      'O aviso de atualização agora aparece dentro do próprio aplicativo (em português), com os botões "Reiniciar e atualizar" ou "Depois" — nada de pop-up do Windows em inglês. Se escolher "Depois", a atualização é instalada sozinha ao fechar o app.',
    ],
  },
  {
    version: '1.2.9',
    date: '2026-11-20',
    notes: [
      'Correção: o aplicativo não fechava quando havia um lote aberto (nem pelo "Sair" nem pelo X). Agora fecha normalmente — o lote continua salvo e retomável ao reabrir.',
    ],
  },
  {
    version: '1.2.8',
    date: '2026-11-20',
    notes: [
      'Processamento em lote: cada imagem agora mostra uma prévia do botton já ajustado, ao lado da escolha de tamanho — dá para conferir o resultado (recorte, fundo e moldura) sem abrir o editor.',
    ],
  },
  {
    version: '1.2.7',
    date: '2026-11-19',
    notes: [
      'Tela "Sobre" mais bonita e com respiro: espaçamento corrigido (não fica mais tudo colado) e a lista de apoiadores carrega em segundo plano, sem travar a página.',
    ],
  },
  {
    version: '1.2.6',
    date: '2026-11-19',
    notes: [
      'O botão "Sair" agora pergunta "tem certeza?" antes de fechar — evita fechar tudo por engano. Ao confirmar, fecha na hora.',
    ],
  },
  {
    version: '1.2.5',
    date: '2026-11-19',
    notes: [
      'Botão "Sair" agora fecha o sistema na hora, com um clique só — sem pop-up e sem precisar fechar a janela na mão.',
    ],
  },
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
