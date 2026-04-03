const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;

// 配置应用名称
app.setName('DevKit');

// macOS Dock 图标适配
if (process.platform === 'darwin') {
  app.dock.setIcon(path.join(__dirname, 'assets/icons/icon.png'));
}

/**
 * 自动更新配置
 */
function setupAutoUpdater() {
  autoUpdater.autoDownload = true; 
  autoUpdater.autoInstallOnAppQuit = true; 

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: '更新准备就绪',
      message: `检测到新版本 ${info.version}，已下载完成。`,
      detail: '是否现在重启并安装更新？',
      buttons: ['下次启动时安装', '立即重启安装']
    }).then(result => {
      if (result.response === 1) autoUpdater.quitAndInstall();
    });
  });
}

// --- 核心修复 1：单例锁 (避免多进程运行) ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果已经有一个实例，则直接自杀
  app.quit();
} else {
  // 当第二个实例尝试启动时，强行聚焦主窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // --- 核心修复 2：单例窗口模式 (封装创建逻辑) ---
  function createWindow() {
    // 如果窗口已经存在，则直接聚焦并返回，杜绝双开
    if (mainWindow !== null) {
      mainWindow.focus();
      return;
    }

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      frame: true,
      titleBarStyle: 'hiddenInset',
      icon: path.join(__dirname, 'assets/icons/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      },
      backgroundColor: '#0f111a'
    });

    // 窗口关闭时显式置空引用，让 activate 生命周期判断更精准
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // 关于面板
    app.setAboutPanelOptions({
      applicationName: 'DevKit',
      applicationVersion: '1.2.0',
      copyright: 'Copyright © 2026 phpxcn',
      version: '1.2.0',
      credits: '一个杂七杂八的工具包',
      authors: ['phpxcn'],
      website: 'https://gitee.com/phpxcn/devkit',
      iconPath: path.join(__dirname, 'assets/icons/icon.icns')
    });

    mainWindow.loadFile('index.html');
    
    // 窗口加载后，如果是生产环境，检查更新
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  }

  // --- 统一生命周期管理 ---
  app.whenReady().then(() => {
    setupAutoUpdater();
    createWindow();
    createMenu();

    app.on('activate', () => {
      // 在 macOS 上点击 Dock 图标时重新激活逻辑
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// --- IPC 通信句柄 (保持原有逻辑) ---
ipcMain.handle('write-clipboard', async (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('read-clipboard', async () => {
  return clipboard.readText();
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

// --- 系统菜单 (保持原有逻辑) ---
function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'DevKit',
      submenu: [
        { label: '关于 DevKit', role: 'about' },
        { type: 'separator' },
        { 
          label: '偏好设置...', 
          accelerator: 'CmdOrCtrl+,', 
          click: () => { if(mainWindow) mainWindow.webContents.send('open-settings'); } 
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
