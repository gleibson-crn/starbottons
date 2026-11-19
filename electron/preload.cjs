// Backend local (ADR-033) — ponte IPC segura entre o renderer (Angular) e o main.
// Com contextIsolation, o renderer só enxerga `window.sb` (nada de Node cru).
// A API cresce conforme cada serviço migra do Supabase para o backend local.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sb', {
  /** Catálogo de tamanhos (print_specs) — só leitura. */
  printSpecs: {
    list: () => ipcRenderer.invoke('db:print-specs:list'),
  },
});
