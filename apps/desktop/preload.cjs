// Exposes a tiny, explicit API to the web client: whether it runs in the desktop app and control of the
// built-in LAN server. Nothing else from Node or Electron reaches the page.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('contaminantDesktop', {
  platform: process.platform,
  server: (action) => ipcRenderer.invoke('desktop:server', action),
});
