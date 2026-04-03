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

  // 设置“关于”面板信息
  app.setAboutPanelOptions({
    applicationName: 'DevKit',
    applicationVersion: '1.2.0',
    copyright: 'Copyright © 2026 phpxcn',
    version: '1.2.0',
    credits: 'A powerful toolbox for professional developers.',
    authors: ['phpxcn'],
    website: 'https://gitee.com/phpxcn/devkit',
    iconPath: path.join(__dirname, 'assets/icons/icon.icns')
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

// --- 创建系统菜单 ---
function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: '关于 DevKit', role: 'about' },
        { type: 'separator' },
        { 
          label: '偏好设置...', 
          accelerator: 'CmdOrCtrl+,', 
          click: () => { mainWindow.webContents.send('open-settings'); } 
        },
        { type: 'separator' },
        { label: '服务', role: 'services' },
        { type: 'separator' },
        { label: '隐藏', role: 'hide' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    }] : []),
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏模式', role: 'togglefullscreen' }
      ]
    },
    {
        label: '帮助',
        submenu: [
          {
            label: '访问代码仓库 (Gitee)',
            click: async () => {
              await shell.openExternal('https://gitee.com/phpxcn/devkit');
            }
          }
        ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 在 app.whenReady() 中调用
app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
