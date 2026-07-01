const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const APP_URL = 'https://nexuspro.cmtelecommgt.com';
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: 'NexusPro Enterprise',
    icon: path.join(__dirname, '../icons/icon-512.png'),
    backgroundColor: '#0A0E1A',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
