<#
  Atalho do Star Bottons (Electron / Fase 0 — ADR-032).

  Chamado pelo atalho "Star Bottons (Electron)" da área de trabalho. Abre uma
  janela de console PRÓPRIA (minimizada) rodando `npm run desktop`, que:
    - sobe o backend+web (up.mjs) na porta livre,
    - espera o app responder,
    - abre a JANELA NATIVA do Electron nessa porta,
    - ao fechar a janela, derruba o backend (e o console fecha).

  Obs.: nesta fase o Electron ainda usa o backend atual (Docker + Supabase).
  As próximas fases removem essa dependência; a Fase 5 gera um instalador .exe
  com atalho próprio (sem console).
#>

$ErrorActionPreference = 'SilentlyContinue'
$proj = Split-Path -Parent $PSScriptRoot

Start-Process -FilePath 'cmd.exe' -WindowStyle Minimized -ArgumentList '/c', `
  "title Star Bottons (Electron) && cd /d `"$proj`" && npm run desktop"
