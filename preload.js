const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // 剪贴板读写
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),

  // 文件选择框和保存框
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // 处理外部链接
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // 这里的 fs 封装可供渲染进程在特殊需求下读写本地配置文件
  // 但我们大部分配置倾向于使用 LocalStorage。
  // 同时提供路径拼接或其它 Node 原生辅助。
});
