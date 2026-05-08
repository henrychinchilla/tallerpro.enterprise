const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray;

const APP_URL = 'https://app.cmtelecommgt.com';
const APP_NAME = 'TallerPro Enterprise';

function createWindow() {
  mainWindow = new BrowserWindow({
    width:          1280,
    height:         800,
    minWidth:       900,
    minHeight:      600,
    title:          APP_NAME,
    icon:           path.join(__dirname, '../icons/icon-512.png'),
    backgroundColor:'#0A0E1A',
    titleBarStyle:  'default',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      spellcheck:       true
    }
  });

  /* Cargar la app desde Vercel */
  mainWindow.loadURL(APP_URL);

  /* Abrir links externos en el navegador, no en Electron */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  /* Pantalla de carga mientras conecta */
  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow.setTitle('Conectando... — ' + APP_NAME);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(APP_NAME);
  });

  /* Sin conexión → mostrar página offline */
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../icons/icon-96.png')
  ).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  const menu = Menu.buildFromTemplate([
    { label: APP_NAME, enabled: false },
    { type: 'separator' },
    { label: 'Abrir',    click: () => mainWindow ? mainWindow.show() : createWindow() },
    { label: 'Dashboard',click: () => mainWindow?.loadURL(APP_URL + '?modulo=dashboard') },
    { label: 'Nueva OT', click: () => mainWindow?.loadURL(APP_URL + '?modulo=ordenes')  },
    { type: 'separator' },
    { label: 'Salir',    click: () => app.quit() }
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow?.show());
}

/* ── APP EVENTS ── */
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  /* En Windows no cerrar la app al cerrar la ventana — queda en tray */
  if (process.platform !== 'darwin') {
    // app.quit(); // Comentado: queda en system tray
  }
});

/* Prevenir múltiples instancias */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
