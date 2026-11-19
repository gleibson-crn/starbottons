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
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const localDb = require('./backend/db.cjs'); // backend local (ADR-033): SQLite

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
  ipcMain.handle('media:read', (_e, name) => localDb.readMedia(name));

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
