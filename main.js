const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu, shell } = require('electron');
const path = require('path');

let mainWindow;

// 配置应用名称，防止在 Mac 顶部菜单栏显示 Default "Electron"
app.setName('DevKit');

// 如果是 macOS，在开发环境下显式设置 Dock 图标
if (process.platform === 'darwin') {
  app.dock.setIcon(path.join(__dirname, 'assets/icons/icon.png'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: true, // 使用标准框架，后续可改为无边框设计以提升颜值
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, 'assets/icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    },
    backgroundColor: '#0f111a' // 背景色预防白屏闪烁
  });

  mainWindow.loadFile('index.html');

  // 这里的开发工具仅在开发环境打开
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 处理剪贴板事件
ipcMain.handle('write-clipboard', async (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('read-clipboard', async () => {
  return clipboard.readText();
});

// 处理本地文件对话框
ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});

// 处理外部链接打开
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});
