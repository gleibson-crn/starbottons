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
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const http = require('node:http');
const localDb = require('./backend/db.cjs'); // backend local (ADR-033): SQLite
const { startStaticServer } = require('./backend/static-server.cjs'); // serve o ng build

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Imprime a folha A4 DIRETO na impressora: abre o diálogo de impressão do
 * sistema (escolher impressora + opções) e envia para o papel — sem passar por
 * visualizador de PDF. `printBackground` preserva arte/cores; `pageSize: A4` +
 * o `@media print`/`@page { size: A4; margin: 0 }` da página garantem que só a
 * folha vá ao papel. Quem quiser PDF escolhe "Microsoft Print to PDF" no próprio
 * diálogo. Cancelar NÃO é erro (evita abrir um 2º diálogo pelo fallback do
 * renderer); só devolve `ok:false` se o diálogo nem abrir (ex.: sem impressora),
 * e aí o renderer tenta o `window.print()`.
 */
async function printSheet(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return { ok: false, error: 'janela não encontrada' };
  }
  try {
    const result = await new Promise((resolve) => {
      win.webContents.print(
        { printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } },
        (success, failureReason) => resolve({ success, failureReason }),
      );
    });
    if (result.success || /cancel/i.test(result.failureReason || '')) {
      return { ok: true };
    }
    return { ok: false, error: result.failureReason || 'falha ao imprimir' };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
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

/** Ícone do app (barra de título + barra de tarefas). */
const ICON = join(__dirname, '..', 'scripts', 'starbottons.ico');

/** Pasta do `ng build` (dist/starbottons/browser). No .exe fica em resources/. */
function distDir() {
  return app.isPackaged
    ? join(process.resourcesPath, 'dist', 'starbottons', 'browser')
    : join(__dirname, '..', 'dist', 'starbottons', 'browser');
}

let staticServer = null; // servidor estático do build (modo disco); fechado no quit.
let appOrigin = process.env.SB_APP_URL || ''; // origem carregada (p/ links externos).

/** true se host:port responde GET / (<400). */
function probe(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: 1200 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Sonda IPv4 e IPv6 (o ng serve no Windows costuma escutar só em ::1). */
async function appReady(port) {
  const [v4, v6] = await Promise.all([probe('127.0.0.1', port), probe('::1', port)]);
  return v4 || v6;
}

/** Modo DEV/fallback: espera o ng serve responder e então carrega a URL. */
async function loadFromServe(win, url) {
  appOrigin = url;
  const port = Number(new URL(url).port || 80);
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    if (win.isDestroyed()) {
      return;
    }
    if (await appReady(port)) {
      break;
    }
    await sleep(400);
  }
  if (!win.isDestroyed()) {
    win.loadURL(url);
  }
}

/**
 * Decide COMO carregar a app, mantendo a tela de carregamento (loading.html)
 * visível até trocar:
 *  - DEV: `SB_APP_URL` setado (start-electron.mjs) → espera o ng serve e troca;
 *  - DISCO: build do Angular presente (.exe empacotado OU build local) → sobe o
 *    servidor estático interno e carrega NA HORA (sem Docker/Supabase/ng serve);
 *  - fallback: tenta o ng serve na porta do .web-port.
 */
async function loadWhenReady(win) {
  if (process.env.SB_APP_URL) {
    await loadFromServe(win, process.env.SB_APP_URL);
    return;
  }
  const dir = distDir();
  if (existsSync(join(dir, 'index.html'))) {
    staticServer = await startStaticServer(dir);
    appOrigin = staticServer.url;
    if (!win.isDestroyed()) {
      win.loadURL(staticServer.url);
    }
    return;
  }
  await loadFromServe(win, `http://localhost:${webPort()}`);
}

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

  // Abre JÁ com a tela de carregamento local (instantânea) e troca pela app
  // assim que o ng serve responder — a janela não espera o build para aparecer.
  win.loadFile(join(__dirname, 'loading.html'));
  void loadWhenReady(win);

  // Links externos (ex.: GitHub, Apoia.se) abrem no navegador do sistema,
  // não dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && (!appOrigin || !url.startsWith(appOrigin))) {
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

  // Auto-update (electron-updater) — SÓ no app empacotado (.exe). Baixa o Release
  // novo em segundo plano; quando pronto, AVISA DENTRO DO APP (evento ao renderer,
  // NÃO o toast nativo do SO) e instala ao sair OU ao pedir "Reiniciar e atualizar".
  // Em dev (não empacotado) não roda.
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoInstallOnAppQuit = true; // instala ao fechar se o usuário adiar
      autoUpdater.on('error', () => {}); // nunca derruba o app por erro de update
      autoUpdater.on('update-downloaded', (info) => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send('update:downloaded', { version: info?.version ?? '' });
        }
      });
      ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
      void autoUpdater.checkForUpdates(); // sem notificação nativa do SO
    } catch {
      /* electron-updater ausente: ignora */
    }
  }

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

// Encerra o servidor estático do build (modo disco) ao sair.
app.on('before-quit', () => {
  try {
    staticServer?.close();
  } catch {
    /* ok */
  }
});
