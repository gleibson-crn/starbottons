# Electron — Fase 0 (prova de conceito)

Esta é a **Fase 0** do plano do [ADR-032](./adr/ADR-032-migracao-para-app-desktop-exe.md):
provar que o Star Bottons roda numa **janela nativa** (Electron), com os controles
do sistema e Sair/X fechando de verdade — ainda usando o backend **atual** (ng serve
+ Supabase local). As próximas fases removem o Docker/Supabase.

## Como rodar a PoC

Por enquanto são **dois passos** (a integração do backend vem nas próximas fases):

```bash
# 1) sobe o backend + o app web (como hoje)
npm run up

# 2) noutro terminal, abre a janela nativa do Electron
npm run electron
```

A janela abre o app em `http://localhost:4200` (troque com a variável `SB_APP_URL`
se o `up` tiver escolhido outra porta).

## O que a Fase 0 valida

- O **Chromium do Electron** renderiza o app idêntico ao modo `--app` de hoje
  (WASM de remover fundo, canvas, geração).
- **Janela nativa**: o X e o botão **Sair** fecham o programa de verdade — sem a
  gambiarra do `.quit` (que fica só no modo atalho/Chrome).
- Base para empacotar um instalador `.exe` (Fase 5).

## Próximas fases (ver ADR-032)

1. Remover login (usuário local único).
2. Banco local (SQLite) no lugar do Supabase/Postgres.
3. Armazenamento local (arquivos) no lugar do Supabase Storage.
4. Geração dentro do próprio programa (portar as Edge Functions).
5. Instalador `.exe` (`electron-builder`) + auto-update nativo (`electron-updater`).
