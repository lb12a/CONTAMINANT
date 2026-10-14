// Contaminant desktop shell (Electron).
// Loads the built web client from disk and can host the game server on this machine, so friends on the
// same network can join (Online → server http://<this-pc>:8787). The server is the same bundle that runs
// in production (packages/server/dist/server.mjs), started as a Node child process.

const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const isDev = !app.isPackaged;
const root = isDev ? path.resolve(__dirname, '../..') : process.resourcesPath;
const clientIndex = isDev ? path.join(root, 'packages/client/dist/index.html') : path.join(root, 'client/index.html');
const serverBundle = isDev ? path.join(root, 'packages/server/dist/server.mjs') : path.join(root, 'server/server.mjs');
const devUrl = process.env.CONTAMINANT_DEV_URL; // e.g. http://localhost:5173 while developing the client
const PORT = Number(process.env.CONTAMINANT_PORT || 8787);

let win = null;
let server = null;
let serverLog = '';

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

function startServer() {
  if (server) return;
  if (!fs.existsSync(serverBundle)) {
    dialog.showErrorBox('Contaminant', `The game server bundle is missing:\n${serverBundle}\n\nRun "npm run build:server" first.`);
    return;
  }
  const dataDir = path.join(app.getPath('userData'), 'server');
  fs.mkdirSync(dataDir, { recursive: true });
  server = fork(serverBundle, ['--port', String(PORT), '--data', path.join(dataDir, 'contaminant.sqlite'), '--static', path.dirname(clientIndex)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const keep = (d) => (serverLog = (serverLog + d).slice(-20000));
  server.stdout.on('data', keep);
  server.stderr.on('data', keep);
  server.on('exit', (code) => {
    server = null;
    buildMenu();
    if (code && code !== 0 && !app.isQuitting) dialog.showErrorBox('Contaminant server stopped', serverLog.slice(-2000));
  });
  buildMenu();
}

function stopServer() {
  if (!server) return;
  server.kill();
  server = null;
  buildMenu();
}

function buildMenu() {
  const lan = lanAddresses();
  const template = [
    {
      label: 'Game',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen', accelerator: 'F11' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'LAN Server',
      submenu: [
        server
          ? { label: `Stop server (port ${PORT})`, click: stopServer }
          : { label: `Host a server on this PC (port ${PORT})`, click: startServer },
        { type: 'separator' },
        { label: server ? `Friends connect to: ${lan.map((a) => `http://${a}:${PORT}`).join(', ') || `http://localhost:${PORT}`}` : 'Not hosting', enabled: false },
        { label: 'Open server dashboard in browser', enabled: !!server, click: () => shell.openExternal(`http://localhost:${PORT}/api/health`) },
        { label: 'Show server log', enabled: !!serverLog, click: () => dialog.showMessageBox({ type: 'info', title: 'Server log', message: serverLog.slice(-4000) || '(empty)' }) },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Toggle developer tools', accelerator: 'Ctrl+Shift+I', click: () => win && win.webContents.toggleDevTools() },
        { label: `Contaminant ${app.getVersion()} · Electron ${process.versions.electron}`, enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 940,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0e0a12',
    title: 'Contaminant',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // links to other sites open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (devUrl) win.loadURL(devUrl);
  else if (fs.existsSync(clientIndex)) win.loadFile(clientIndex);
  else
    win.loadURL(
      `data:text/html,${encodeURIComponent('<body style="background:#0e0a12;color:#e8dfc8;font-family:sans-serif;padding:40px"><h1>Client build missing</h1><p>Run <code>npm run build:client</code> and start again.</p></body>')}`,
    );
}

ipcMain.handle('desktop:server', (_e, action) => {
  if (action === 'start') startServer();
  if (action === 'stop') stopServer();
  return { running: !!server, port: PORT, lan: lanAddresses() };
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  if (process.argv.includes('--host-server') || process.env.CONTAMINANT_HOST === '1') startServer();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
