// Star Bottons — Fase 0 (ADR-032): prova de conceito do app Electron.
//
// Abre o app num JANELA NATIVA (controles do sistema, Sair/X fecham de verdade),
// ainda apontando para o backend ATUAL (ng serve + Supabase local). Nas próximas
// fases, o Electron passa a embutir o próprio backend (SQLite + arquivos locais).
//
// Como rodar a PoC (dois passos, por enquanto):
//   1) num terminal:  npm run up        (sobe Docker + Supabase + edge + web)
//   2) noutro:        npm run electron   (abre esta janela nativa)
//
// A URL do app pode ser trocada por SB_APP_URL (padrão: http://localhost:4200).

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const localDb = require('./backend/db.cjs'); // backend local (ADR-033): SQLite

/**
 * Imprime a folha A4 gerando um PDF e abrindo-o no visualizador do sistema.
 * No Electron, `window.print()` abre o diálogo nativo SEM painel de prévia
 * ("este aplicativo não dá suporte à visualização de impressão"). Gerar o PDF
 * dá uma prévia real (e permite SALVAR a folha). `preferCSSPageSize` usa o
 * `@page { size: A4 }` do app e `printBackground` preserva arte/cores — paridade
 * com o print do navegador (respeita o `@media print` da página).
 */
async function printSheet(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return { ok: false, error: 'janela não encontrada' };
  }
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });
  const file = join(tmpdir(), `star-bottons-folha-${Date.now()}.pdf`);
  writeFileSync(file, pdf);
  const err = await shell.openPath(file); // '' = sucesso
  return err ? { ok: false, error: err } : { ok: true, path: file };
}

/** Porta do front escolhida pelo up.mjs (scripts/.web-port), ou 4200. */
function webPort() {
  try {
    const p = readFileSync(join(__dirname, '..', 'scripts', '.web-port'), 'utf8').trim();
    return /^\d+$/.test(p) ? p : '4200';
  } catch {
    return '4200';
  }
}

const APP_URL = process.env.SB_APP_URL || `http://localhost:${webPort()}`;
/** Ícone do app (barra de título + barra de tarefas). */
const ICON = join(__dirname, '..', 'scripts', 'starbottons.ico');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Star Bottons',
    icon: ICON,
    backgroundColor: '#140a1f', // mesmo fundo do app (evita flash branco)
    autoHideMenuBar: true, // sem barra de menu do Electron (visual de app)
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), // expõe window.sb (backend local)
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL);

  // Links externos (ex.: GitHub, Apoia.se) abrem no navegador do sistema,
  // não dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return win;
}

app.whenReady().then(() => {
  // Identidade no Windows: agrupa e usa o ícone certo na barra de tarefas.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.starbottons.app');
  }
  Menu.setApplicationMenu(null); // sem menu nativo nesta PoC

  // Backend local (ADR-033): handlers IPC. Cresce a cada serviço migrado.
  ipcMain.handle('db:print-specs:list', () => localDb.listPrintSpecs());
  ipcMain.handle('bg:list', () => localDb.listBackgrounds());
  ipcMain.handle('bg:save', (_e, input) => localDb.saveBackground(input));
  ipcMain.handle('bg:remove', (_e, id) => localDb.removeBackground(id));
  ipcMain.handle('mk:list', () => localDb.listMockups());
  ipcMain.handle('mk:save', (_e, input) => localDb.saveMockup(input));
  ipcMain.handle('mk:update', (_e, { id, patch }) => localDb.updateMockup(id, patch));
  ipcMain.handle('mk:remove', (_e, id) => localDb.removeMockup(id));
  ipcMain.handle('fr:list', () => localDb.listFrames());
  ipcMain.handle('fr:save', (_e, input) => localDb.saveFrame(input));
  ipcMain.handle('fr:framing', (_e, { id, framing }) => localDb.updateFraming(id, framing));
  ipcMain.handle('fr:layers', (_e, templateId) => localDb.listLayers(templateId));
  ipcMain.handle('fr:composition', (_e, input) => localDb.saveComposition(input));
  ipcMain.handle('fr:copy', (_e, src) => localDb.copyPng(src));
  ipcMain.handle('fr:remove', (_e, id) => localDb.removeFrame(id));
  ipcMain.handle('media:read', (_e, name) => localDb.readMedia(name));
  // uploads + geração (ADR-034 F1/F4)
  ipcMain.handle('up:save', (_e, input) => localDb.saveUpload(input));
  ipcMain.handle('gen:run', (_e, body) => localDb.generate(body));
  ipcMain.handle('gen:render-path', (_e, jobId) => localDb.renderPath(jobId));
  ipcMain.handle('print:sheet', (e) => printSheet(e));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Fecha o programa quando a janela é fechada (Sair do app OU X da janela).
app.on('window-all-closed', () => {
  app.quit();
});
