

# DevKit

DevKit 是一款基于 Electron 构建的强大开发者工具箱应用。它集成了多种日常开发中高频使用的工具，旨在通过直观的界面和高效的交互，提升开发者的工作效率。

## ✨ 核心特性

### �表格工具 (Table Tools)
强大的表格数据转换与处理工具，支持多种格式相互转换：
- **导入格式**：CSV、Excel (xlsx)、JSON、YAML、XML、HTML、Markdown、SQL、ASCII、LaTeX
- **导出格式**：CSV、Excel (xlsx)、JSON、YAML、XML、HTML、Markdown、SQL、ASCII、LaTeX
- 支持操作历史（撤销/重做）
- 支持文件导入导出
- 支持数据去重、转置等操作

### ⏰ 时间戳工具 (Timestamp Tool)
- 快捷的时间戳双向转换
- 支持秒级/毫秒级时间戳
- 显示本地时间和 ISO 格式
- 提供一键复制功能

### 📝 JSON 工具 (JSON Tool)
- JSON 格式化与压缩
- JSON 语法验证
- JSON 搜索与替换
- JSON 树形视图展示
- 支持虚拟滚动大数据展示

### 🔀 JSON/文本差异工具 (Diff Tool)
- JSON 差异对比
- 文本差异对比
- 可视化差异结果

### 🔐 加密工具 (Crypto Tool)
- 多种加密算法支持
- 可配置密钥

### 🔑 密码生成器 (Password Tool)
- 自定义密码长度
- 字符类型选项（大写、小写、数字、特殊字符）
- 密码强度实时显示

### ⚙️ 设置中心 (Settings)
- 主题切换：Light（亮色）、Midnight（午夜）、Cyberpunk（赛博朋克）

## 🛠 技术栈

- **框架核心**: [Electron](https://www.electronjs.org/) (v28)
- **核心依赖**:
  - `xlsx` - Excel 文件解析与导出
  - `papaparse` - CSV 文件解析
  - `js-yaml` / `json5` - YAML/JSON 格式转换
  - `jspdf` / `jspdf-autotable` - PDF 导出支持
  - `crypto-js` - 加密解密
  - `codemirror` - 代码编辑器
  - `lz-string` - 字符串压缩

## 🚀 启动与开发

确保本地已安装 [Node.js](https://nodejs.org/) 环境。

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

## 📁 项目结构

```
DevKit/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── index.html           # 主页面
├── package.json         # 项目配置
├── assets/              # 静态资源
│   └── icons/           # 应用图标
├── src/
│   ├── renderer.js      # 渲染进程入口
│   ├── styles.css       # 全局样式
│   ├── models/          # 数据模型
│   │   └── TableDataset.js
│   ├── converters/      # 格式转换器
│   │   ├── TableConverterManager.js
│   │   ├── TableConverters.js
│   │   ├── MarkdownConverter.js
│   │   └── MoreConverters.js
│   ├── ui/              # UI 组件
│   │   └── JSONTreeView.js
│   └── tools/           # 工具模块
│       ├── TableTool/
│       ├── TimestampTool/
│       ├── JsonTool/
│       ├── JsonDiffTool/
│       ├── TextDiffTool/
│       ├── CryptoTool/
│       ├── PasswordTool/
│       └── SettingsTool/
└── scripts/             # 构建脚本
    └── cleanup.js
```

## 📄 开源许可证

[ISC](LICENSE)