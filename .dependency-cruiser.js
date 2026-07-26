/**
 * dependency-cruiser — regras de arquitetura em camadas do Star Bottons.
 *
 * Camadas (src/app):
 *   core/     infraestrutura (supabase, auth, guards, config, generation)
 *   shared/   utilitários puros, tipos e UI reutilizável (sem dependências de app)
 *   features/ telas/fluxos (auth, upload, editor, generation, result)
 *
 * O MOTOR de geração (service, gateway, errors, buildGenerateRequest) vive em
 * `core/generation` — é infraestrutura sem UI, reusável por qualquer feature
 * (ex.: o fluxo single em features/generation e o fluxo em lote em
 * features/batch). O `UploadService` (envio ao bucket) vive em `core/upload`;
 * a matemática pura de layout em `shared/utils/editor-geometry`; e o CanvasEditor
 * reutilizável em `shared/ui/canvas-editor`. Assim nenhuma feature precisa
 * importar outra: a regra `features-nao-se-importam` abaixo vale sem exceções.
 *
 * Pelo mesmo motivo, o DOMÍNIO + ESTADO do LOTE (o `BatchStore` por signals,
 * o modelo `BatchItem`/tamanhos, o gating por resolução, a nomeação de arquivos
 * e o `ZipExportService`) vive em `core/batch` — infra sem UI reusável (ex.: o
 * fluxo em lote em features/batch e o `upload.page` que apenas encaminha ao
 * store). Os COMPONENTES do lote ficam em `features/batch` importando de
 * `core/batch`.
 *
 * Direção de dependência permitida:
 *   features -> core, shared
 *   core     -> shared
 *   shared   -> (nada de core/features)
 *
 * Rode: npx depcruise src --config .dependency-cruiser.js
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Dependências circulares indicam acoplamento a ser quebrado.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-nao-importa-features',
      severity: 'error',
      comment: 'core/ é infraestrutura e não pode depender de features/.',
      from: { path: '^src/app/core' },
      to: { path: '^src/app/features' },
    },
    {
      name: 'shared-nao-importa-core',
      severity: 'error',
      comment: 'shared/ deve ser folha reutilizável; não pode depender de core/.',
      from: { path: '^src/app/shared' },
      to: { path: '^src/app/core' },
    },
    {
      name: 'shared-nao-importa-features',
      severity: 'error',
      comment: 'shared/ não pode depender de features/.',
      from: { path: '^src/app/shared' },
      to: { path: '^src/app/features' },
    },
    {
      name: 'features-nao-se-importam',
      severity: 'error',
      comment:
        'Uma feature não pode importar outra feature diretamente; compartilhe via shared/ ou core/.',
      from: { path: '^src/app/features/([^/]+)/' },
      to: {
        path: '^src/app/features/([^/]+)/',
        pathNot: '^src/app/features/$1/',
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Módulos órfãos podem ser código morto.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(spec|test)\\.ts$',
          '\\.d\\.ts$',
          '(^|/)index\\.ts$',
          '(^|/)\\.gitkeep$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '\\.(spec|test)\\.ts$' },
  },
};
