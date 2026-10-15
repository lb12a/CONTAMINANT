// Exposes a tiny, explicit API to the web client: whether it runs in the desktop app and control of the
// built-in LAN server, and the servers announcing themselves on the same network. Nothing else from
// Node or Electron reaches the page.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('contaminantDesktop', {
  platform: process.platform,
  server: (action) => ipcRenderer.invoke('desktop:server', action),
  lan: () => ipcRenderer.invoke('desktop:lan'),
});
