const { app, BrowserWindow, Menu, Tray, shell } = require('electron');
const path = require('path');
const APP_URL = 'https://app.cmtelecommgt.com';
let mainWindow, tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1280, height:800, minWidth:900, minHeight:600,
    title:'TallerPro Enterprise',
    icon: path.join(__dirname,'../icons/icon-512.png'),
    backgroundColor:'#0A0E1A', autoHideMenuBar:true,
    webPreferences:{ nodeIntegration:false, contextIsolation:true }
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.webContents.setWindowOpenHandler(({url})=>{
    if(!url.startsWith(APP_URL)){shell.openExternal(url);return{action:'deny'};}
    return{action:'allow'};
  });
  mainWindow.on('closed',()=>{mainWindow=null;});
}

app.whenReady().then(()=>{
  createWindow();
  const lock = app.requestSingleInstanceLock();
  if(!lock){app.quit();}
});
app.on('window-all-closed',()=>{ /* Queda en tray */ });
app.on('second-instance',()=>{ if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
