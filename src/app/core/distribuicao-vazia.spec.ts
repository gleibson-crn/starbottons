import { execSync } from 'node:child_process';

/**
 * GUARDIÃO da distribuição vazia.
 *
 * O Star Bottons é distribuído como sistema puro: cada usuário começa com as
 * bibliotecas (molduras/mockups/fundos) VAZIAS e sobe o seu próprio acervo.
 * Nada do dono (dados, backups, seed, acervo) pode ir no repositório — senão
 * viajaria junto em todo download. Estes testes falham o gate se algo assim
 * entrar no versionamento.
 */
function trackedFiles(): string[] {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return []; // fora de um repo git (ex.: tarball): guardião não se aplica
  }
}

describe('Guardião: distribuição começa vazia', () => {
  const files = trackedFiles();

  it('sem arquivos de dados/backup (.dump/.bak/.backup/.csv/.tsv)', () => {
    const bad = files.filter((f) => /\.(dump|bak|backup|csv|tsv)$/i.test(f));
    expect(bad, `dados/backup não podem ir ao repo: ${bad.join(', ')}`).toEqual([]);
  });

  it('sem .sql de dados (seed/dump) — só migrations do schema', () => {
    const bad = files.filter((f) => f.endsWith('.sql') && !f.startsWith('supabase/migrations/'));
    expect(bad, `.sql fora de supabase/migrations (seed/dump de dados): ${bad.join(', ')}`).toEqual(
      [],
    );
  });

  it('sem acervo de imagens embutido (cada usuário sobe o seu)', () => {
    // Permitido: ícones de UI em src/ e o favicon. Proibido: qualquer imagem de
    // acervo (molduras/mockups/fundos) versionada fora disso.
    const bad = files.filter(
      (f) => /\.(png|jpe?g|webp)$/i.test(f) && !f.startsWith('src/') && !/favicon/i.test(f),
    );
    expect(bad, `acervo embutido não pode ir ao repo: ${bad.join(', ')}`).toEqual([]);
  });
});
