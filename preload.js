const { ipcRenderer } = require('electron');

window.electron = {
  // 剪贴板读写
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),

  // 文件选择框和保存框
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // 处理外部链接
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // 检查更新（返回 { ok, status, version/message }，发现新版由页面引导前往 GitHub 下载）
  checkForUpdate: () => ipcRenderer.invoke('app:check-update'),

  // 应用版本号（设置页“关于”用，跟随 package.json version）
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  // PDF 工具箱
  detectLibreOffice: () => ipcRenderer.invoke('pdf-detect-libreoffice'),
  officeToPdf: (filePath) => ipcRenderer.invoke('office-to-pdf', filePath),
  pdfDecryptViaWindow: (filePath) => ipcRenderer.invoke('pdf-decrypt-via-window', filePath),
};
