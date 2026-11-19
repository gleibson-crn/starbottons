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
  /** Mídia local: devolve os bytes de um arquivo (o renderer monta o blob URL). */
  media: {
    read: (name) => ipcRenderer.invoke('media:read', name),
  },
});
