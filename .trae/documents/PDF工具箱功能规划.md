# PDF 工具箱功能规划

## Context（背景与目标）

DevKit 是 Electron 模块化工具箱，每个工具 = `view.html` + `module.js` + 可选 `style.css`，由 `src/renderer.js` 的 `ToolRegistry` 动态加载。用户要求新增「PDF 工具箱」，聚合 8 类 PDF 能力：PDF↔Office/图片互转、页面操作（拆分/合并/提取/删除）、压缩、加密解密。项目当前**无任何 PDF 处理库**（仅 `jspdf` 用于表格导出、`md-to-pdf` 走原生 printToPDF），需引入纯 JS 的 PDF 处理生态。

核心约束：离线优先、纯 JS 优先，UI/CSS 与现有工具（尤其 TableTool 的 tab 模式、MarkdownPdfTool 的文件流程）完全统一。

## 技术方案选型（混合：离线纯 JS 为主，LibreOffice 为 Office→PDF 增强）

| 子能力 | 实现库 | 路径 | 可靠性 |
|---|---|---|---|
| 拆分/合并/提取/删除页 | `pdf-lib` | 主进程或渲染进程均可，纯 JS | 高 |
| 加密（设密码/权限） | `pdf-lib` `save({userPassword,ownerPassword,permissions})` | 纯 JS | 高 |
| 解密（去密码） | 隐藏 `BrowserWindow` + Chromium 原生密码框 + `printToPDF` | 复用 `main.js` 现有隐藏窗口模式 | 高（向量 PDF 保真） |
| 压缩 | `pdfjs-dist` 逐页渲染→JPEG@可调 DPI/质量→`pdf-lib` 重排 | 纯 JS，有损 | 中高（类在线压缩器） |
| PDF→图片 | `pdfjs-dist` 渲染 canvas→PNG/JPG，输出到用户选定目录 | 纯 JS | 高 |
| PDF→Word | `pdfjs-dist` 提文本→`docx` 生成 .docx | 纯 JS，文本级保真 | 中 |
| PDF→Excel | `pdfjs-dist` 提文本/表→已装 `xlsx` 生成 .xlsx | 纯 JS，表格识别尽力而为 | 中 |
| PDF→PPT | `pdfjs-dist` 逐页渲染图→`pptxgenjs` 一页一图 | 纯 JS，视觉保真高 | 中高 |
| Office→PDF（Word/Excel） | `mammoth`(docx→HTML)/`xlsx`(→HTML表格)→隐藏窗口 `printToPDF` | 纯 JS 降级 | 中 |
| Office→PDF（PPT 及高质量） | 检测 LibreOffice → `soffice --headless --convert-to pdf` | 需用户装 LibreOffice（可选） | 高 |

**LibreOffice 策略**：启动时检测 `soffice`/`libreoffice` 是否在 PATH（macOS 还查 `/Applications/LibreOffice.app`）。已装→Office→PDF 全格式走 LibreOffice；未装→Word/Excel 走纯 JS 降级、PPT 显示「需安装 LibreOffice 才能转换」提示并提供下载链接。**不强制依赖**，符合离线工具定位。

## 新增依赖（package.json dependencies）

- `pdf-lib` — PDF 结构操作（拆分/合并/加密/页面增删）
- `pdfjs-dist` — PDF 渲染与文本提取（转图片/Word/Excel/PPT/压缩）
- `docx` — 生成 .docx（PDF→Word）
- `pptxgenjs` — 生成 .pptx（PDF→PPT）
- `mammoth` — .docx→HTML（Word→PDF 降级路径）

> `xlsx` 已存在，复用于 PDF→Excel 与 Excel→PDF。共 5 个新依赖。

## UI 结构（与 TableTool 的 tab 模式统一）

一个工具 `pdf-toolbox`，顶部 `.format-tabs` 分三组共 8 个 `.tab-item`：

- **格式转换**：PDF→Word / PDF→Excel / PDF→PPT / PDF→图片 / Office→PDF
- **页面操作**：拆分 / 合并 / 提取页面 / 删除页面
- **安全优化**：压缩 / 加密 / 解密

布局复用 `MarkdownPdfTool` 的 `actions-bar` + `tool-card` + `card-header-fused`/`card-body-fused`：
1. 顶部 actions-bar：当前 tab 标题 +「选择文件」按钮（支持多选/拖拽，用统一拖拽区）+ 执行按钮
2. tab 切换后动态渲染「选项面板」（参考 `TableTool/module.js` 的 `renderTableConfig` 模式 L331-L401）：各子功能的参数（页面范围、DPI、密码、输出格式…）
3. 文件信息区：显示已选文件名/页数
4. 状态/日志区：进度与结果

样式统一引用 `src/styles.css` 变量（`--bg-card` `--input-bg` `--accent-color` `--success` `--danger` `--border-color` 等），`.tab-item` 样式从 `TableTool/style.css` 抽公共部分或直接复用类名。

## 文件改动清单

1. **`package.json`** — dependencies 追加 5 个库
2. **`main.js`** — 新增 IPC handler：
   - `pdf-detect-libreoffice`：返回 LibreOffice 可执行路径或 null
   - `office-to-pdf`：`child_process.spawn` 调 `soffice --headless --convert-to pdf --outdir <tmp> <file>`，返回产物路径
   - `pdf-decrypt-via-window`：隐藏窗口加载加密 PDF（Chromium 弹原生密码框）→ `printToPDF` 返回无密 Buffer（解密降级/主路径）
   - 复用现有 `show-open-dialog`/`show-save-dialog`/`md-to-pdf`
3. **`preload.js`** — `window.electron` 追加：`detectLibreOffice` `officeToPdf` `pdfDecryptViaWindow`
4. **`src/tools/PdfToolbox/view.html`**（新建）— tab 化 UI + 拖拽区 + 选项面板容器 + 状态区
5. **`src/tools/PdfToolbox/module.js`**（新建）— 调度器：
   - `renderTabOptions(tabId)` 按 tab 渲染选项（仿 `renderTableConfig`）
   - 各子功能独立函数：`splitPdf` `mergePdfs` `extractPages` `deletePages` `compressPdf` `encryptPdf` `decryptPdf` `pdfToImages` `pdfToWord` `pdfToExcel` `pdfToPpt` `officeToPdf`
   - 统一文件选择/保存辅助：复用 `window.electron.showOpenDialog/showSaveDialog` + `fs.readFileSync/writeFileSync`（参考 `TableTool/module.js` L504-L572、`MarkdownPdfTool/module.js` L217-L227）
   - `pdfjs-dist` worker 配置：用 legacy build + `GlobalWorkerOptions.workerSrc` 指向 `node_modules/pdfjs-dist/build/pdf.worker.min.js`（或 `workerPort`）。在 `init` 内一次性 require 并配置
   - `window.onToolUnload` 清理
6. **`src/tools/PdfToolbox/style.css`**（新建）— tab 样式 + 拖拽区样式（复用全局变量）
7. **`src/renderer.js`** — `ToolRegistry` 注册 `pdf-toolbox`（条目格式同 L112-L116）
8. **`index.html`** — 侧边栏新增 `.nav-item data-page="pdf-toolbox"`（SVG 图标沿用 24x24 / stroke-width:2 / fill:none 约定）
9. **`README.md`** — 补充「PDF 工具箱」特性段、技术栈、目录结构

## 关键实现细节

- **页面范围语法**：统一支持 `1-3,5,8-10`（解析为页码数组），复用于拆分/提取/删除/转图片子集
- **合并**：`showOpenDialog` 用 `properties:['openFile','multiSelections']`，`pdf-lib` 的 `copyPages` 拼接
- **拆分**：两种模式——「每页一个 PDF」输出到目录；「按范围分组」输出单文件。默认每页一个，输出到用户选定目录
- **图片输出**：输出到目录（`showOpenDialog` `properties:['openDirectory']`），文件名 `page-001.png`
- **压缩**：选项 = DPI(72/96/150) + JPEG质量(低/中/高) + 灰度开关；用 `pdfjs` 渲染每页→`canvas.toDataURL('image/jpeg',q)`→`pdf-lib` `embedJpg` 逐页新建文档
- **加密**：选项 = 用户密码 + 所有者密码 + 权限多选（打印/复制/批注）；`pdf-lib` `save({userPassword,ownerPassword,permissions})`
- **解密**：优先 `pdf-lib.load(bytes,{password})` 重存；若抛错则降级 `pdf-decrypt-via-window` IPC（隐藏窗口原生密码框 → printToPDF）
- **PDF→Word**：`pdfjs` `getTextContent` 按页提文本，用 `docx` 的 `Document/Paragraph` 生成，标题启发式（字号大→Heading）
- **PDF→Excel**：`pdfjs` 文本块按坐标聚类成行/列 → `xlsx` `aoa_to_sheet`（尽力而为，复杂表格不保证）
- **PDF→PPT**：`pdfjs` 逐页渲染 PNG → `pptxgenjs` `addImage` 全屏铺满每页
- **LibreOffice 调用**：`spawn(sofficePath,['--headless','--convert-to','pdf','--outdir',tmpDir,filePath])`，等 `close` 事件后读 `tmpDir/同名.pdf`，用 `app.getPath('temp')` 做临时目录
- **状态反馈**：每个执行按钮置 disabled + 文案「处理中…」，完成后用 `--success`/`--danger` 色提示并 `alert`/状态栏文字（沿用 MarkdownPdfTool 模式）

## 验证方式

1. `npm install` 后 `node --check` 校验 `module.js`/`main.js`/`preload.js` 语法
2. `npm start` 启动，侧栏点「PDF 工具箱」依次测试每个 tab：
   - 拆分：选多页 PDF→输出目录应得到 N 个单页 PDF
   - 合并：选 2+ PDF→得到单个合并 PDF，页数=之和
   - 提取/删除：`1-3` 范围验证页数正确
   - 加密：设密码→新 PDF 打开需密码；解密：输入密码→新 PDF 无密码
   - 压缩：图片型 PDF 体积明显下降
   - PDF→图片：得到 PNG 文件数=页数
   - PDF→Word/Excel/PPT：产物可被 Office/WPS 打开
   - Office→PDF：若装了 LibreOffice 三格式都过；未装时 Word/Excel 走降级、PPT 提示安装
3. 切换 4 套皮肤（default/light/green/sepia）确认 UI 配色一致、无硬编码色值
4. 切走工具再切回确认 `onToolUnload` 清理无残留（无定时器/监听泄漏）

## 实施顺序

1. 加依赖 + `npm install` + 冒烟测 `require('pdf-lib')`/`require('pdfjs-dist')`
2. `main.js`/`preload.js` 加 IPC 与桥接
3. 建 `PdfToolbox` 三件套（view/module/style）+ 注册 + 导航
4. 逐 tab 实现并自测
5. 更新 README
