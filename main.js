const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { spawn, spawnSync } = require('child_process');
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

// --- Markdown 转 PDF ---
// 通过隐藏 BrowserWindow 渲染 HTML 后调用原生 printToPDF, 完美支持中文与完整 CSS
ipcMain.handle('md-to-pdf', async (event, htmlContent, options) => {
  const printOptions = Object.assign({
    pageSize: 'A4',
    printBackground: true,
    margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
  }, options || {});

  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });

  let tmpHtmlPath = null;
  try {
    // 写临时 HTML 文件再 loadFile：data URL 有 2MB 上限，含内嵌图片的 HTML 会超限导致 ERR_INVALID_URL
    tmpHtmlPath = path.join(app.getPath('temp'), `devkit-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
    fs.writeFileSync(tmpHtmlPath, htmlContent, 'utf8');
    await pdfWindow.loadFile(tmpHtmlPath);
    // loadFile 在页面加载完成后 resolve; printToPDF 会等待渲染就绪
    const pdfData = await pdfWindow.webContents.printToPDF(printOptions);
    return pdfData;
  } finally {
    pdfWindow.destroy();
    if (tmpHtmlPath) { try { fs.unlinkSync(tmpHtmlPath); } catch (_) {} }
  }
});

// --- PDF 工具箱: 探测 LibreOffice 可执行路径 ---
// 缓存探测结果避免重复调用 which/where
let libreofficePathCache = undefined; // undefined=未探测, string=路径, null=不存在
function detectLibreOfficePath() {
  if (libreofficePathCache !== undefined) return libreofficePathCache;

  // macOS 额外检查固定安装路径
  if (process.platform === 'darwin') {
    const macPath = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
    if (fs.existsSync(macPath)) {
      libreofficePathCache = macPath;
      return libreofficePathCache;
    }
  }

  // 通过 which(mac/linux) 或 where(win) 探测 PATH 中的命令
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const names = process.platform === 'win32'
    ? ['soffice.exe', 'libreoffice.exe']
    : ['libreoffice', 'soffice'];
  for (const name of names) {
    const r = spawnSync(cmd, [name], { encoding: 'utf8' });
    if (r.status === 0) {
      const out = (r.stdout || '').trim().split(/\r?\n/)[0];
      if (out) {
        libreofficePathCache = out;
        return libreofficePathCache;
      }
    }
  }

  libreofficePathCache = null;
  return libreofficePathCache;
}

ipcMain.handle('pdf-detect-libreoffice', async () => {
  return detectLibreOfficePath();
});

// --- PDF 工具箱: Office 文件转 PDF (调用 LibreOffice headless) ---
ipcMain.handle('office-to-pdf', async (event, filePath) => {
  const sofficePath = detectLibreOfficePath();
  if (!sofficePath) {
    return { ok: false, error: '未检测到 LibreOffice，无法转换 Office 文件。请安装 LibreOffice：https://www.libreoffice.org/download/' };
  }

  const tmpDir = app.getPath('temp');
  // -env:UserInstallation 指定独立配置目录, 避免与已运行的 LibreOffice 单实例锁冲突
  const profileDir = path.join(tmpDir, 'lo-profile-' + Date.now());
  const args = [
    '--headless',
    '-env:UserInstallation=file://' + profileDir,
    '--convert-to', 'pdf',
    '--outdir', tmpDir,
    filePath
  ];

  return new Promise((resolve) => {
    const child = spawn(sofficePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', () => {
      const outPath = path.join(tmpDir, path.basename(filePath, path.extname(filePath)) + '.pdf');
      if (fs.existsSync(outPath)) {
        resolve({ ok: true, outPath });
      } else {
        resolve({ ok: false, error: '转换失败，未生成 PDF' + (stderr.trim() ? '（' + stderr.trim() + '）' : '') });
      }
    });

    child.on('error', (err) => {
      resolve({ ok: false, error: '调用 LibreOffice 失败：' + err.message });
    });
  });
});

// --- PDF 工具箱: 通过隐藏窗口解密 PDF (复用 Chromium 原生密码框 + printToPDF) ---
ipcMain.handle('pdf-decrypt-via-window', async (event, filePath) => {
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });

  try {
    // file:// 协议加载本地 PDF; 加密 PDF 会触发 Chromium 原生密码输入框, 用户输入后页面加载完成
    await pdfWindow.loadURL(url.pathToFileURL(filePath).href);
    // printToPDF 输出无密码的 PDF 字节
    const pdfData = await pdfWindow.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    return Buffer.from(pdfData);
  } catch (e) {
    throw new Error('用户取消或密码错误');
  } finally {
    pdfWindow.destroy();
  }
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
        ...(app.isPackaged ? [] : [{ label: '开发者工具', role: 'toggleDevTools' }]),
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
