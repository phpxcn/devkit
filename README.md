# DevKit

DevKit 是一款基于 Electron 构建的强大开发者工具箱应用。它集成了多种日常开发中高频使用的工具，旨在通过直观的界面和高效的交互，提升开发者的工作效率。

## ✨ 核心特性

- **表格工具 (Table Tools)**：强大的表格数据转换与处理工具。支持多种格式（如 CSV, Excel (xlsx), JSON, YAML, Markdown 等）相互转换。支持操作历史（撤销/重做）及文件导入等无缝交互体验。
- **时间戳工具 (Timestamp Tool)**：快捷的时间戳双向转换工具，提供一键复制等便携功能。
- **现代化 UI 设计**：采用类 Mac 风格的精致界面，提供流畅的操作反馈与体验。

## 🛠 技术栈

- 框架核心: [Electron](https://www.electronjs.org/) (v28)
- 核心依赖:
  - `xlsx` - 用于 Excel 文件的解析与导出
  - `papaparse` - 用于 CSV 文件的高效解析
  - `js-yaml` / `json5` - 用于灵活的数据格式转换
  - `jspdf` & `jspdf-autotable` - 预留用于 PDF 导出相关的生成支持
  - `pngjs` - 图像处理辅助库

## 🚀 启动与开发

请确保你本地已安装 [Node.js](https://nodejs.org/) 环境。

```bash
# 1. 安装项目依赖
npm install

# 2. 启动本地开发环境
npm start
```

## 📦 打包构建

本项目使用 `electron-builder` 进行各平台的打包构建：

```bash
# 构建 macOS 应用程序 (.app / .dmg)
npm run build-mac

# 构建 Windows 应用程序 (.exe)
npm run build-win

# 构建 Linux 应用程序 (.AppImage / .deb / .snap)
npm run build-linux
```

## 📄 开源许可证

[ISC](LICENSE)
