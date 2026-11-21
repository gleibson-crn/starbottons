// Backend local (ADR-033) — ponte IPC segura entre o renderer (Angular) e o main.
// Com contextIsolation, o renderer só enxerga `window.sb` (nada de Node cru).
// A API cresce conforme cada serviço migra do Supabase para o backend local.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sb', {
  /** Catálogo de tamanhos (print_specs) — só leitura. */
  printSpecs: {
    list: () => ipcRenderer.invoke('db:print-specs:list'),
  },
  /** Biblioteca de fundos (background_templates + arquivos locais). */
  backgrounds: {
    list: () => ipcRenderer.invoke('bg:list'),
    save: (input) => ipcRenderer.invoke('bg:save', input),
    remove: (id) => ipcRenderer.invoke('bg:remove', id),
  },
  /** Templates de cenário (mockup_templates + arquivos locais). */
  mockups: {
    list: () => ipcRenderer.invoke('mk:list'),
    save: (input) => ipcRenderer.invoke('mk:save', input),
    update: (id, patch) => ipcRenderer.invoke('mk:update', { id, patch }),
    remove: (id) => ipcRenderer.invoke('mk:remove', id),
  },
  /** Molduras (frame_templates + frame_template_layers + arquivos locais). */
  frames: {
    list: () => ipcRenderer.invoke('fr:list'),
    save: (input) => ipcRenderer.invoke('fr:save', input),
    updateFraming: (id, framing) => ipcRenderer.invoke('fr:framing', { id, framing }),
    listLayers: (templateId) => ipcRenderer.invoke('fr:layers', templateId),
    saveComposition: (input) => ipcRenderer.invoke('fr:composition', input),
    copyPng: (src) => ipcRenderer.invoke('fr:copy', src),
    remove: (id) => ipcRenderer.invoke('fr:remove', id),
  },
  /** Mídia local: devolve os bytes de um arquivo (o renderer monta o blob URL). */
  media: {
    read: (name) => ipcRenderer.invoke('media:read', name),
  },
  /** Originais enviados (uploads + arquivos locais) — ADR-034 F1. */
  uploads: {
    save: (input) => ipcRenderer.invoke('up:save', input),
  },
  /** Geração da arte de impressão em processo (SQLite+arquivos) — ADR-034 F4. */
  generate: (body) => ipcRenderer.invoke('gen:run', body),
  /** Caminho do render de um job (freshPrintUrl após recarregar o lote). */
  renderPath: (jobId) => ipcRenderer.invoke('gen:render-path', jobId),
  /** Lista as impressoras disponíveis (para o seletor dentro do app). */
  listPrinters: () => ipcRenderer.invoke('print:list-printers'),
  /** Imprime a folha A4 direto na impressora escolhida, sem o diálogo do SO. */
  printSheet: (opts) => ipcRenderer.invoke('print:sheet', opts),
  /** Abre as configurações avançadas do driver da impressora (papel, qualidade). */
  openPrinterSettings: (deviceName) => ipcRenderer.invoke('print:settings', deviceName),
  /** Auto-update (.exe): avisa quando a nova versão foi baixada. */
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),
  /** Reinicia e instala a atualização já baixada. */
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
