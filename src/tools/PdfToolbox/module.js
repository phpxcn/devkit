const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { PDFDocument, degrees } = require('pdf-lib');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
// 配置 pdfjs worker：用 Blob URL 装载 worker 源码，确保渲染进程能正确解码/绘制图片 XObject
// （直接 require worker bundle 得到的是模块对象而非 URL，会导致 worker 加载失败、图片渲染为空白）
try {
    const _workerPath = require.resolve('pdfjs-dist/build/pdf.worker.min.js');
    const _workerCode = fs.readFileSync(_workerPath, 'utf8');
    const _blob = new Blob([_workerCode], { type: 'application/javascript' });
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(_blob);
} catch (e) {
    console.warn('[PdfToolbox] pdfjs worker 未配置，将使用主线程降级', e && e.message);
}
const { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun } = require('docx');
const pptxgen = require('pptxgenjs');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

// --- Tab 元数据 ---
const TAB_META = {
    pdf2word:  { title: 'PDF 转 Word',   btn: '转为 Word',   accept: ['pdf'],            multiple: false },
    pdf2excel: { title: 'PDF 转 Excel',  btn: '转为 Excel',  accept: ['pdf'],            multiple: false },
    pdf2ppt:   { title: 'PDF 转 PPT',    btn: '转为 PPT',    accept: ['pdf'],            multiple: false },
    pdf2img:   { title: 'PDF 转图片',   btn: '转为图片',    accept: ['pdf'],            multiple: false },
    office2pdf:{ title: 'Office 转 PDF', btn: '转为 PDF',    accept: ['docx','doc','xlsx','xls','pptx','ppt'], multiple: false },
    split:     { title: '拆分 PDF',      btn: '拆分 PDF',    accept: ['pdf'],            multiple: false },
    merge:     { title: '合并 PDF',      btn: '合并 PDF',    accept: ['pdf'],            multiple: true  },
    extract:   { title: '提取页面',      btn: '提取页面',    accept: ['pdf'],            multiple: false },
    delete:    { title: '删除页面',      btn: '删除页面',    accept: ['pdf'],            multiple: false },
    compress:  { title: '压缩 PDF',      btn: '压缩 PDF',    accept: ['pdf'],            multiple: false },
    encrypt:   { title: '加密 PDF',      btn: '加密 PDF',    accept: ['pdf'],            multiple: false },
    decrypt:   { title: '解密 PDF',      btn: '解密 PDF',    accept: ['pdf'],            multiple: false }
};

// --- 各 Tab 的选项 Schema（仿 TableTool TableConfigSchemas） ---
// 转换类 5 个 tab 公共两项（mode=转换模式、pageRange=转换范围），追加在各自原有选项之前
const CONVERT_COMMON_SCHEMA = [
    { id: 'mode', type: 'radio', label: '转换模式', default: 'layout',
      options: [{ value: 'layout', label: '布局优先' }, { value: 'edit', label: '编辑优先' }] },
    { id: 'pageRange', type: 'range', label: '转换范围', default: { start: 0, end: 0 } }
];
const TabSchema = {
    pdf2word: [...CONVERT_COMMON_SCHEMA],
    pdf2excel: [...CONVERT_COMMON_SCHEMA],
    pdf2ppt: [...CONVERT_COMMON_SCHEMA],
    pdf2img: [
        ...CONVERT_COMMON_SCHEMA,
        { id: 'format', type: 'select', label: '图片格式', options: ['PNG', 'JPG'], default: 'PNG' },
        { id: 'dpi',    type: 'select', label: '渲染 DPI', options: ['96', '150', '200'], default: '150' }
    ],
    office2pdf: [...CONVERT_COMMON_SCHEMA],
    split: [
        { id: 'mode', type: 'radio', label: '拆分模式', options: [
            { label: '每页一个 PDF（输出到目录）', value: 'each' },
            { label: '按范围分组（输出单文件）',   value: 'range' }
        ], default: 'each' },
        { id: 'range', type: 'text', label: '页面范围（仅在「按范围分组」生效，如 1-3,5,8-10）', default: '1' }
    ],
    merge: [],
    extract: [
        { id: 'range', type: 'text', label: '页面范围（如 1-3,5,8-10 或 all）', default: 'all' }
    ],
    delete: [
        { id: 'range', type: 'text', label: '要删除的页面范围（如 1-3,5,8-10）', default: '' }
    ],
    compress: [
        { id: 'dpi',      type: 'select', label: '渲染 DPI', options: ['72', '96', '150'], default: '96' },
        { id: 'quality',  type: 'select', label: 'JPEG 质量', options: [
            { label: '低（小体积）', value: 'low' },
            { label: '中',            value: 'medium' },
            { label: '高（清晰）',    value: 'high' }
        ], default: 'medium' },
        { id: 'grayscale', type: 'checkbox', label: '灰度（进一步减小体积）', default: false }
    ],
    encrypt: [
        { id: 'userPwd',  type: 'text', label: '用户密码（打开时输入）',       default: '', inputType: 'password' },
        { id: 'ownerPwd', type: 'text', label: '所有者密码（修改权限时输入）', default: '', inputType: 'password' },
        { id: 'allowPrint',    type: 'checkbox', label: '允许打印',     default: true },
        { id: 'allowCopy',     type: 'checkbox', label: '允许复制文本', default: true },
        { id: 'allowModify',   type: 'checkbox', label: '允许修改',     default: true },
        { id: 'allowAnnotate', type: 'checkbox', label: '允许批注',     default: true }
    ],
    decrypt: [
        { id: 'password', type: 'text', label: '密码（如有）', default: '', inputType: 'password' }
    ]
};

module.exports = {
    init: function () {
        const state = {
            tab: 'pdf2word',
            files: [],          // [{ path, name }]
            options: {}         // { tabId: { optId: value } }
        };

        // 预填各 tab 的选项默认值（对象型默认值浅拷贝，避免多 tab 共享同一引用串改）
        Object.keys(TAB_META).forEach(t => {
            state.options[t] = {};
            (TabSchema[t] || []).forEach(item => {
                state.options[t][item.id] = (item.default && typeof item.default === 'object' && !Array.isArray(item.default))
                    ? { ...item.default } : item.default;
            });
        });

        // --- DOM refs ---
        const $tabs = document.querySelectorAll('#pdf-format-tabs .tab-item');
        const $tabTitle = document.getElementById('pdf-tab-title');
        const $dropHint = document.getElementById('pdf-drop-hint');
        const $filePick = document.getElementById('pdf-file-pick');
        const $clearBtn = document.getElementById('pdf-clear-files');
        const $drop = document.getElementById('pdf-drop-zone');
        const $fileList = document.getElementById('pdf-file-list');
        const $opts = document.getElementById('pdf-options-container');
        const $run = document.getElementById('pdf-run');
        const $status = document.getElementById('pdf-status');

        // --- 辅助：状态反馈 ---
        function setStatus(msg, type) {
            $status.textContent = msg;
            $status.classList.remove('busy', 'success', 'error');
            if (type) $status.classList.add(type);
        }
        function setBusy(busy) {
            $run.disabled = busy;
            $run.textContent = busy ? '处理中…' : (TAB_META[state.tab].btn);
        }

        // --- 辅助：页面范围解析（1-based 字符串 → 0-based 索引数组） ---
        function parsePageRange(str, total) {
            if (!str || !str.trim() || str.trim().toLowerCase() === 'all') {
                return Array.from({ length: total }, (_, i) => i);
            }
            const result = [];
            const parts = str.split(',').map(s => s.trim()).filter(Boolean);
            for (const part of parts) {
                const dash = part.split('-').map(s => s.trim());
                if (dash.length === 2) {
                    const a = parseInt(dash[0], 10);
                    const b = parseInt(dash[1], 10);
                    if (!isNaN(a) && !isNaN(b)) {
                        const lo = Math.min(a, b), hi = Math.max(a, b);
                        for (let i = lo; i <= hi; i++) if (i >= 1 && i <= total) result.push(i - 1);
                    }
                } else {
                    const n = parseInt(part, 10);
                    if (!isNaN(n) && n >= 1 && n <= total) result.push(n - 1);
                }
            }
            // 去重 + 升序
            return Array.from(new Set(result)).sort((a, b) => a - b);
        }

        // 由 mode/pageRange 选项得到实际要处理的页码（1-based）数组；0/0 表示全部
        function resolvePages(total, opts) {
            const pr = (opts && opts.pageRange) || { start: 0, end: 0 };
            let s = Number(pr.start) || 0, e = Number(pr.end) || 0;
            if (s <= 0 && e <= 0) return Array.from({ length: total }, (_, i) => i + 1);
            if (s <= 0) s = 1;
            if (e <= 0 || e > total) e = total;
            if (s > total) return [];
            const out = [];
            for (let i = s; i <= e; i++) out.push(i);
            return out;
        }

        // 渲染单页为 PNG Buffer（Electron renderer 有真实 canvas）
        async function renderPageToPng(pdf, pageNum, scale = 1.5) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');
            return { buf: Buffer.from(dataUrl.split(',')[1], 'base64'), width: canvas.width, height: canvas.height };
        }

        // --- 选项面板渲染（仿 TableTool renderTableConfig） ---
        function renderTabOptions(tabId) {
            const schema = TabSchema[tabId] || [];
            if (schema.length === 0) {
                $opts.innerHTML = '<div class="empty-state" style="padding:4px;justify-content:flex-start;">无附加选项</div>';
                return;
            }
            const vals = state.options[tabId] || {};
            let checkboxHtml = '<div class="pdf-opt-checkbox-group">';
            let gridHtml = '<div class="pdf-opt-grid">';
            let hasCheckbox = false, hasGrid = false;

            schema.forEach(item => {
                const desc = item.desc ? `<div class="pdf-opt-desc">${item.desc}</div>` : '';
                if (item.type === 'checkbox') {
                    hasCheckbox = true;
                    checkboxHtml += `
                        <label class="f-checkbox-label">
                            <input type="checkbox" data-id="${item.id}" ${vals[item.id] ? 'checked' : ''}>
                            <div class="checkbox-box"></div>
                            <span class="checkbox-text">${item.label}</span>
                        </label>`;
                } else if (item.type === 'radio') {
                    hasGrid = true;
                    let radios = '<div class="pdf-radio-group">';
                    item.options.forEach(opt => {
                        const val = typeof opt === 'object' ? opt.value : opt;
                        const lab = typeof opt === 'object' ? opt.label : opt;
                        radios += `
                            <label class="pdf-radio-label">
                                <input type="radio" name="${item.id}" data-id="${item.id}" value="${val}" ${vals[item.id] === val ? 'checked' : ''}>
                                <span>${lab}</span>
                            </label>`;
                    });
                    radios += '</div>';
                    gridHtml += `<div class="pdf-opt-row"><span class="pdf-opt-label">${item.label}</span>${radios}${desc}</div>`;
                } else if (item.type === 'select') {
                    hasGrid = true;
                    let opts = '';
                    item.options.forEach(opt => {
                        const val = typeof opt === 'object' ? opt.value : opt;
                        const lab = typeof opt === 'object' ? opt.label : opt;
                        opts += `<option value="${val}" ${vals[item.id] == val ? 'selected' : ''}>${lab}</option>`;
                    });
                    gridHtml += `<div class="pdf-opt-row"><span class="pdf-opt-label">${item.label}</span><select class="f-select-modern" data-id="${item.id}">${opts}</select>${desc}</div>`;
                } else if (item.type === 'text') {
                    hasGrid = true;
                    const it = item.inputType || 'text';
                    gridHtml += `<div class="pdf-opt-row"><span class="pdf-opt-label">${item.label}</span><input type="${it}" class="f-input-modern" data-id="${item.id}" value="${vals[item.id] || ''}" placeholder="${item.default || ''}">${desc}</div>`;
                } else if (item.type === 'range') {
                    hasGrid = true;
                    const cur = vals[item.id] || {};
                    gridHtml += `<div class="pdf-opt-row"><span class="pdf-opt-label">${item.label}</span><div class="pdf-opt-range"><input type="number" min="1" class="f-input-modern" data-id="${item.id}" data-key="start" value="${cur.start ?? 0}"> <span class="range-dash">-</span> <input type="number" min="1" class="f-input-modern" data-id="${item.id}" data-key="end" value="${cur.end ?? 0}"> <span class="range-unit">页</span></div>${desc}</div>`;
                }
            });
            checkboxHtml += '</div>';
            gridHtml += '</div>';

            let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
            if (hasCheckbox) html += checkboxHtml;
            if (hasGrid) html += gridHtml;
            html += '</div>';
            $opts.innerHTML = html;

            $opts.querySelectorAll('input, select').forEach(el => {
                el.addEventListener('change', () => {
                    const id = el.dataset.id;
                    const key = el.dataset.key;
                    if (key) {
                        // range 类型：start/end 写入对象
                        const cur = state.options[tabId][id] || {};
                        cur[key] = Number(el.value) || 0;
                        state.options[tabId][id] = cur;
                    } else if (el.type === 'radio') {
                        state.options[tabId][id] = el.value;
                    } else if (el.type === 'checkbox') {
                        state.options[tabId][id] = el.checked;
                    } else {
                        state.options[tabId][id] = el.value;
                    }
                });
            });
        }

        // --- 文件列表渲染 ---
        function renderFileList() {
            if (state.files.length === 0) {
                $fileList.innerHTML = '<div class="empty-state" style="padding:8px;justify-content:flex-start;">尚未选择文件</div>';
                return;
            }
            $fileList.innerHTML = state.files.map((f, idx) => `
                <div class="pdf-file-item">
                    <span class="file-name" title="${f.path}">${idx + 1}. ${f.name}</span>
                    <span class="file-remove" data-idx="${idx}" title="移除">✕</span>
                </div>`).join('');
            $fileList.querySelectorAll('.file-remove').forEach(el => {
                el.addEventListener('click', () => {
                    const idx = parseInt(el.dataset.idx, 10);
                    state.files.splice(idx, 1);
                    renderFileList();
                });
            });
        }

        // --- 切换 Tab ---
        function switchTab(tabId) {
            if (!TAB_META[tabId]) return;
            state.tab = tabId;
            $tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
            const meta = TAB_META[tabId];
            $tabTitle.textContent = meta.title;
            $run.textContent = meta.btn;
            const acceptDesc = meta.accept.join('、').toUpperCase();
            $dropHint.textContent = `支持${meta.multiple ? '多个' : '单个'} ${acceptDesc} 文件${meta.multiple ? '（可多选）' : ''}`;
            // 不同 tab 文件类型不同，清空已选避免混淆
            state.files = [];
            renderFileList();
            renderTabOptions(tabId);
            setStatus('就绪');
        }

        // --- 文件选择 ---
        function buildFilters(accept) {
            const groups = [];
            if (accept.includes('pdf')) groups.push({ name: 'PDF', extensions: ['pdf'] });
            const officeExts = accept.filter(e => e !== 'pdf');
            if (officeExts.length) groups.push({ name: 'Office', extensions: officeExts });
            groups.push({ name: 'All Files', extensions: ['*'] });
            return groups;
        }

        async function pickFiles() {
            const meta = TAB_META[state.tab];
            const props = meta.multiple ? ['openFile', 'multiSelections'] : ['openFile'];
            const res = await window.electron.showOpenDialog({
                title: '选择文件',
                properties: props,
                filters: buildFilters(meta.accept)
            });
            if (!res || !res.filePaths || res.filePaths.length === 0) return;
            const validExts = meta.accept;
            const newFiles = [];
            for (const fp of res.filePaths) {
                const ext = path.extname(fp).toLowerCase().replace(/^\./, '');
                if (!validExts.includes(ext)) {
                    setStatus(`跳过不支持的文件: ${path.basename(fp)}`, 'error');
                    continue;
                }
                newFiles.push({ path: fp, name: path.basename(fp) });
            }
            if (meta.multiple) {
                state.files = state.files.concat(newFiles);
            } else {
                state.files = newFiles.slice(0, 1);
            }
            renderFileList();
            if (newFiles.length) setStatus(`已选择 ${state.files.length} 个文件`);
        }

        // --- 拖拽 ---
        function onDragOver(e) { e.preventDefault(); $drop.classList.add('dragover'); }
        function onDragLeave(e) { e.preventDefault(); $drop.classList.remove('dragover'); }
        function onDrop(e) {
            e.preventDefault();
            $drop.classList.remove('dragover');
            const meta = TAB_META[state.tab];
            const dropped = Array.from(e.dataTransfer.files || []);
            const newFiles = [];
            for (const f of dropped) {
                const ext = path.extname(f.name).toLowerCase().replace(/^\./, '');
                if (!meta.accept.includes(ext)) {
                    setStatus(`跳过不支持的文件: ${f.name}`, 'error');
                    continue;
                }
                newFiles.push({ path: f.path, name: f.name });
            }
            if (meta.multiple) {
                state.files = state.files.concat(newFiles);
            } else {
                state.files = newFiles.slice(0, 1);
            }
            renderFileList();
            if (newFiles.length) setStatus(`已选择 ${state.files.length} 个文件`);
        }

        // --- 通用保存对话框 ---
        async function askSavePath(defaultName, ext) {
            const res = await window.electron.showSaveDialog({
                defaultPath: defaultName,
                filters: [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All Files', extensions: ['*'] }]
            });
            return res && res.filePath ? res.filePath : null;
        }
        async function askOutputDir() {
            const res = await window.electron.showOpenDialog({
                title: '选择输出目录',
                properties: ['openDirectory', 'createDirectory']
            });
            return res && res.filePaths && res.filePaths.length ? res.filePaths[0] : null;
        }

        // 校验至少有一个文件
        function requireFiles(minCount) {
            if (state.files.length < minCount) {
                alert(minCount === 1 ? '请先选择文件' : `请至少选择 ${minCount} 个文件`);
                return false;
            }
            return true;
        }

        // 取首个文件的去扩展名，作为导出默认文件名
        function srcBaseName() {
            if (!state.files.length) return '';
            return path.basename(state.files[0].name, path.extname(state.files[0].name));
        }

        // ===================================================
        // ====== 12 个执行函数 =============================
        // ===================================================

        // 1. 拆分 PDF
        async function splitPdf() {
            if (!requireFiles(1)) return;
            const opts = state.options.split;
            const srcPath = state.files[0].path;
            const srcBytes = fs.readFileSync(srcPath);
            const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
            const total = srcDoc.getPageCount();

            if (opts.mode === 'each') {
                // 每页一个 PDF，输出到目录
                const dir = await askOutputDir();
                if (!dir) { setStatus('已取消'); return; }
                setBusy(true);
                setStatus(`正在拆分 ${total} 页…`);
                const baseName = path.basename(srcPath, '.pdf');
                for (let i = 0; i < total; i++) {
                    const out = await PDFDocument.create();
                    const [p] = await out.copyPages(srcDoc, [i]);
                    out.addPage(p);
                    const bytes = await out.save();
                    fs.writeFileSync(path.join(dir, `${baseName}-page-${String(i + 1).padStart(3, '0')}.pdf`), bytes);
                }
                setStatus(`已拆分 ${total} 页到目录: ${dir}`, 'success');
            } else {
                // 按范围分组：输出单文件
                const pages = parsePageRange(opts.range, total);
                if (pages.length === 0) { alert('页面范围为空或无效'); return; }
                const savePath = await askSavePath(`${srcBaseName()}-split.pdf`, 'pdf');
                if (!savePath) { setStatus('已取消'); return; }
                setBusy(true);
                setStatus(`正在提取 ${pages.length} 页…`);
                const out = await PDFDocument.create();
                const copied = await out.copyPages(srcDoc, pages);
                copied.forEach(p => out.addPage(p));
                fs.writeFileSync(savePath, await out.save());
                setStatus(`已生成 ${pages.length} 页的 PDF: ${path.basename(savePath)}`, 'success');
            }
        }

        // 2. 合并 PDF
        async function mergePdfs() {
            if (!requireFiles(2)) return;
            const savePath = await askSavePath(`${srcBaseName()}-merged.pdf`, 'pdf');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus(`正在合并 ${state.files.length} 个 PDF…`);
            const out = await PDFDocument.create();
            for (const f of state.files) {
                setStatus(`正在合并: ${f.name}`);
                const bytes = fs.readFileSync(f.path);
                const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
                const copied = await out.copyPages(doc, doc.getPageIndices());
                copied.forEach(p => out.addPage(p));
            }
            fs.writeFileSync(savePath, await out.save());
            setStatus(`已合并 ${state.files.length} 个文件 → ${path.basename(savePath)}`, 'success');
        }

        // 3. 提取页面
        async function extractPages() {
            if (!requireFiles(1)) return;
            const opts = state.options.extract;
            const srcPath = state.files[0].path;
            const bytes = fs.readFileSync(srcPath);
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const total = doc.getPageCount();
            const pages = parsePageRange(opts.range, total);
            if (pages.length === 0) { alert('页面范围为空或无效'); return; }
            const savePath = await askSavePath(`${srcBaseName()}-extracted.pdf`, 'pdf');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus(`正在提取 ${pages.length} 页…`);
            const out = await PDFDocument.create();
            const copied = await out.copyPages(doc, pages);
            copied.forEach(p => out.addPage(p));
            fs.writeFileSync(savePath, await out.save());
            setStatus(`已提取 ${pages.length} 页 → ${path.basename(savePath)}`, 'success');
        }

        // 4. 删除页面
        async function deletePages() {
            if (!requireFiles(1)) return;
            const opts = state.options.delete;
            const srcPath = state.files[0].path;
            const bytes = fs.readFileSync(srcPath);
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const total = doc.getPageCount();
            const toDelete = parsePageRange(opts.range, total);
            if (toDelete.length === 0) { alert('请填写要删除的页面范围'); return; }
            const deleteSet = new Set(toDelete);
            const keep = [];
            for (let i = 0; i < total; i++) if (!deleteSet.has(i)) keep.push(i);
            if (keep.length === 0) { alert('不能删除全部页面'); return; }
            const savePath = await askSavePath(`${srcBaseName()}-deleted.pdf`, 'pdf');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus(`正在删除 ${toDelete.length} 页，保留 ${keep.length} 页…`);
            const out = await PDFDocument.create();
            const copied = await out.copyPages(doc, keep);
            copied.forEach(p => out.addPage(p));
            fs.writeFileSync(savePath, await out.save());
            setStatus(`已删除 ${toDelete.length} 页 → ${path.basename(savePath)}`, 'success');
        }

        // 5. 压缩 PDF
        async function compressPdf() {
            if (!requireFiles(1)) return;
            const opts = state.options.compress;
            const srcPath = state.files[0].path;
            const savePath = await askSavePath(`${srcBaseName()}-compressed.pdf`, 'pdf');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus('正在压缩…');
            const srcBytes = fs.readFileSync(srcPath);
            const srcStat = fs.statSync(srcPath);
            const dpi = parseInt(opts.dpi, 10);
            const scale = dpi / 72;
            const qMap = { low: 0.3, medium: 0.6, high: 0.85 };
            const quality = qMap[opts.quality] || 0.6;

            const loadingTask = pdfjs.getDocument({ data: srcBytes });
            const pdf = await loadingTask.promise;
            const total = pdf.numPages;
            const out = await PDFDocument.create();
            const A4_W = 595.28, A4_H = 841.89; // points

            for (let i = 1; i <= total; i++) {
                setStatus(`压缩中: 第 ${i}/${total} 页`);
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;

                // 灰度处理
                if (opts.grayscale) {
                    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const d = img.data;
                    for (let j = 0; j < d.length; j += 4) {
                        const g = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
                        d[j] = d[j + 1] = d[j + 2] = g;
                    }
                    ctx.putImageData(img, 0, 0);
                }

                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                const jpgBytes = Buffer.from(dataUrl.split(',')[1], 'base64');
                const jpg = await out.embedJpg(jpgBytes);

                // 新页 A4 纵向，图片按比例铺满
                const newPage = out.addPage([A4_W, A4_H]);
                const ratio = Math.min(A4_W / jpg.width, A4_H / jpg.height);
                const w = jpg.width * ratio, h = jpg.height * ratio;
                newPage.drawImage(jpg, { x: (A4_W - w) / 2, y: (A4_H - h) / 2, width: w, height: h });
            }

            const outBytes = await out.save();
            fs.writeFileSync(savePath, outBytes);
            const outStat = fs.statSync(savePath);
            const ratioPct = ((1 - outStat.size / srcStat.size) * 100).toFixed(1);
            const sign = outStat.size < srcStat.size ? '↓' : '↑';
            setStatus(`压缩完成: ${(srcStat.size/1024).toFixed(0)}KB → ${(outStat.size/1024).toFixed(0)}KB (${sign}${Math.abs(ratioPct)}%)`, 'success');
        }

        // 6. 加密 PDF
        async function encryptPdf() {
            if (!requireFiles(1)) return;
            const opts = state.options.encrypt;
            if (!opts.userPwd && !opts.ownerPwd) {
                alert('请至少填写一个密码（用户密码或所有者密码）');
                return;
            }
            const srcPath = state.files[0].path;
            const savePath = await askSavePath(`${srcBaseName()}-encrypted.pdf`, 'pdf');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus('正在加密…');
            const bytes = fs.readFileSync(srcPath);
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const outBytes = await doc.save({
                userPassword: opts.userPwd || undefined,
                ownerPassword: opts.ownerPwd || undefined,
                permissions: {
                    printing: opts.allowPrint ? 'highResolution' : 'disallowed',
                    copying: !!opts.allowCopy,
                    modifying: !!opts.allowModify,
                    annotating: !!opts.allowAnnotate
                }
            });
            fs.writeFileSync(savePath, outBytes);
            setStatus(`已加密 → ${path.basename(savePath)}`, 'success');
        }

        // 7. 解密 PDF
        async function decryptPdf() {
            if (!requireFiles(1)) return;
            const opts = state.options.decrypt;
            const srcPath = state.files[0].path;
            const savePath = await askSavePath(`${srcBaseName()}-decrypted.pdf`, 'pdf');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus('正在解密…');
            const bytes = fs.readFileSync(srcPath);
            // 主路径：pdf-lib 直接 load 带密码
            try {
                const doc = await PDFDocument.load(bytes, { password: opts.password || undefined });
                const outBytes = await doc.save();
                fs.writeFileSync(savePath, outBytes);
                setStatus(`已解密 → ${path.basename(savePath)}`, 'success');
                return;
            } catch (e) {
                setStatus('pdf-lib 解密失败，降级到原生窗口方式…', 'busy');
            }
            // 降级：隐藏窗口 + Chromium 原生密码框
            try {
                const outBuffer = await window.electron.pdfDecryptViaWindow(srcPath);
                if (!outBuffer) throw new Error('主进程返回空数据');
                fs.writeFileSync(savePath, Buffer.from(outBuffer));
                setStatus(`已解密（原生窗口）→ ${path.basename(savePath)}`, 'success');
            } catch (e) {
                setStatus('解密失败: ' + (e.message || e), 'error');
                alert('解密失败: ' + (e.message || e));
            }
        }

        // 8. PDF 转图片
        async function pdfToImages() {
            if (!requireFiles(1)) return;
            const opts = state.options.pdf2img || {};
            const dir = await askOutputDir();
            if (!dir) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus('正在渲染页面…');
            const srcBytes = fs.readFileSync(state.files[0].path);
            const loadingTask = pdfjs.getDocument({ data: srcBytes });
            const pdf = await loadingTask.promise;
            const total = pdf.numPages;
            const pages = resolvePages(total, opts);
            const dpi = parseInt(opts.dpi, 10);
            const scale = dpi / 72;
            const fmt = (opts.format || 'PNG').toLowerCase();
            const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
            const baseName = path.basename(state.files[0].path, '.pdf');
            // mode 对纯图片输出无意义，保留选项以与其它转换 tab 一致

            for (const p of pages) {
                setStatus(`渲染中: 第 ${p}/${total} 页`);
                const page = await pdf.getPage(p);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                const dataUrl = canvas.toDataURL(mime, fmt === 'jpg' ? 0.92 : undefined);
                const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
                fs.writeFileSync(path.join(dir, `${baseName}-page-${String(p).padStart(3, '0')}.${fmt}`), buf);
            }
            setStatus(`已导出 ${pages.length} 张图片到: ${dir}`, 'success');
        }

        // 9. PDF 转 Word
        async function pdfToWord() {
            if (!requireFiles(1)) return;
            const savePath = await askSavePath(`${srcBaseName()}.docx`, 'docx');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            const srcBytes = fs.readFileSync(state.files[0].path);
            const loadingTask = pdfjs.getDocument({ data: srcBytes });
            const pdf = await loadingTask.promise;
            const total = pdf.numPages;
            const opts = state.options['pdf2word'] || {};
            const pages = resolvePages(total, opts);

            // 布局优先：逐页渲染成图片嵌入（保排版、不可编辑文字）
            if (opts.mode !== 'edit') {
                setStatus('布局优先模式：逐页渲染图像嵌入…');
                const imgParagraphs = [];
                for (const p of pages) {
                    setStatus(`渲染页面图像: 第 ${p}/${total} 页`);
                    const { buf, width, height } = await renderPageToPng(pdf, p, 1.5);
                    // 按页面宽度等比缩放显示，适配 Word 正文区（~600px @96dpi）
                    const displayW = 600;
                    const displayH = Math.round(height * (displayW / width));
                    imgParagraphs.push(new Paragraph({
                        children: [new ImageRun({ data: buf, transformation: { width: displayW, height: displayH } })]
                    }));
                    imgParagraphs.push(new Paragraph({ children: [new TextRun('')] }));
                }
                const doc = new Document({ sections: [{ children: imgParagraphs }] });
                const buffer = await Packer.toBuffer(doc);
                fs.writeFileSync(savePath, buffer);
                setStatus(`已转为 Word（图像版）→ ${path.basename(savePath)}（${pages.length} 页图像）`, 'success');
                return;
            }

            // 编辑优先：提取文本层
            setStatus('编辑优先模式：提取文本…');
            const paragraphs = [];
            let extractedLen = 0;
            for (const p of pages) {
                setStatus(`提取中: 第 ${p}/${total} 页`);
                const page = await pdf.getPage(p);
                const content = await page.getTextContent();
                // 按 transform[6]（y 坐标）聚合同行；启发式：字号明显大 → 标题
                const lines = new Map();
                for (const item of content.items) {
                    const tr = item.transform || [1,0,0,1,0,0];
                    const y = Math.round(tr[5]);
                    const size = item.height || (tr && tr[0]) || 10;
                    const arr = lines.get(y) || { texts: [], size: 0 };
                    arr.texts.push(item.str || '');
                    arr.size = Math.max(arr.size, size);
                    lines.set(y, arr);
                }
                const sortedYs = Array.from(lines.keys()).sort((a, b) => b - a);
                for (const y of sortedYs) {
                    const obj = lines.get(y);
                    const text = obj.texts.join('').trim();
                    if (!text) continue;
                    extractedLen += text.length;
                    if (obj.size > 16) {
                        paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }));
                    } else if (obj.size > 12) {
                        paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }));
                    } else {
                        paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
                    }
                }
                paragraphs.push(new Paragraph({ children: [new TextRun('')] })); // 页间空行
            }

            // 文本层为空（扫描/矢量/轮廓字 PDF）→ 逐页渲染成图片嵌入，避免空白
            if (extractedLen === 0) {
                setStatus('未检测到文本层，改用页面图像嵌入…');
                const imgParagraphs = [];
                for (const p of pages) {
                    setStatus(`渲染页面图像: 第 ${p}/${total} 页`);
                    const { buf, width, height } = await renderPageToPng(pdf, p, 1.5);
                    const displayW = 600;
                    const displayH = Math.round(height * (displayW / width));
                    imgParagraphs.push(new Paragraph({
                        children: [new ImageRun({ data: buf, transformation: { width: displayW, height: displayH } })]
                    }));
                    imgParagraphs.push(new Paragraph({ children: [new TextRun('')] }));
                }
                const doc = new Document({ sections: [{ children: imgParagraphs }] });
                const buffer = await Packer.toBuffer(doc);
                fs.writeFileSync(savePath, buffer);
                setStatus(`已转为 Word（图像版）→ ${path.basename(savePath)}（${pages.length} 页图像，原 PDF 无文本层）`, 'success');
                return;
            }

            const doc = new Document({ sections: [{ children: paragraphs }] });
            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(savePath, buffer);
            setStatus(`已转为 Word（文本版）→ ${path.basename(savePath)}（${paragraphs.length} 段落）`, 'success');
        }

        // 10. PDF 转 Excel
        async function pdfToExcel() {
            if (!requireFiles(1)) return;
            const savePath = await askSavePath(`${srcBaseName()}.xlsx`, 'xlsx');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            const srcBytes = fs.readFileSync(state.files[0].path);
            const loadingTask = pdfjs.getDocument({ data: srcBytes });
            const pdf = await loadingTask.promise;
            const total = pdf.numPages;
            const opts = state.options['pdf2excel'] || {};
            const pages = resolvePages(total, opts);

            // 布局优先：用 exceljs 把每页贴成图片，保留排版
            if (opts.mode !== 'edit') {
                setStatus('布局优先模式：逐页渲染并贴入 Excel…');
                const wb = new ExcelJS.Workbook();
                for (const p of pages) {
                    setStatus(`渲染页面图像: 第 ${p}/${total} 页`);
                    const { buf, width, height } = await renderPageToPng(pdf, p, 1.5);
                    const imgId = wb.addImage({ buffer: buf, extension: 'png' });
                    const ws = wb.addWorksheet(`Page${p}`);
                    // 一点锚定 + 显式像素尺寸，按原图比例缩放（与原 PDF 页面比例一致）
                    const maxW = 600, dispW = Math.min(maxW, width), dispH = Math.round(height * dispW / width);
                    ws.addImage(imgId, {
                        tl: { col: 0, row: 0 },
                        ext: { width: dispW, height: dispH }
                    });
                }
                await wb.xlsx.writeFile(savePath);
                setStatus(`已转为 Excel（图像版）→ ${path.basename(savePath)}（${pages.length} 页图像）`, 'success');
                return;
            }

            // 编辑优先：提取文本到表格
            setStatus('编辑优先模式：提取文本…');
            const wb = XLSX.utils.book_new();
            let extractedLen = 0;
            for (const p of pages) {
                setStatus(`提取中: 第 ${p}/${total} 页`);
                const page = await pdf.getPage(p);
                const content = await page.getTextContent();
                // 按 y 行聚类，行内按 x 排序，列按 x 间距分桶
                const rowMap = new Map();
                for (const item of content.items) {
                    const tr = item.transform || [1,0,0,1,0,0];
                    const y = Math.round(tr[5]);
                    const x = tr[4];
                    extractedLen += (item.str || '').length;
                    if (!rowMap.has(y)) rowMap.set(y, []);
                    rowMap.get(y).push({ x, str: item.str || '' });
                }
                const ys = Array.from(rowMap.keys()).sort((a, b) => b - a); // y 从上到下
                // 收集所有 x 坐标做列分桶
                const allX = [];
                ys.forEach(y => rowMap.get(y).forEach(it => allX.push(it.x)));
                allX.sort((a, b) => a - b);
                // 简单分列：x 差距 > 40 当作新列
                const colBoundaries = [];
                let last = null;
                for (const x of allX) {
                    if (last === null || x - last > 40) { colBoundaries.push(x); last = x; }
                    else { last = x; }
                }
                const aoa = [];
                for (const y of ys) {
                    const items = rowMap.get(y).sort((a, b) => a.x - b.x);
                    const row = new Array(colBoundaries.length).fill('');
                    for (const it of items) {
                        let ci = 0;
                        for (let k = colBoundaries.length - 1; k >= 0; k--) {
                            if (it.x >= colBoundaries[k] - 5) { ci = k; break; }
                        }
                        row[ci] += (row[ci] ? ' ' : '') + it.str;
                    }
                    aoa.push(row);
                }
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                XLSX.utils.book_append_sheet(wb, ws, `Page${p}`);
            }

            // 无文本层（扫描/矢量 PDF）→ 编辑优先也降级为逐页贴图，避免空白
            if (extractedLen === 0) {
                setStatus('未检测到文本层，改用页面图像嵌入…');
                const imgWb = new ExcelJS.Workbook();
                for (const p of pages) {
                    setStatus(`渲染页面图像: 第 ${p}/${total} 页`);
                    const { buf, width, height } = await renderPageToPng(pdf, p, 1.5);
                    const imgId = imgWb.addImage({ buffer: buf, extension: 'png' });
                    const iws = imgWb.addWorksheet(`Page${p}`);
                    // 一点锚定 + 显式像素尺寸，按原图比例缩放（与原 PDF 页面比例一致）
                    const maxW = 600, dispW = Math.min(maxW, width), dispH = Math.round(height * dispW / width);
                    iws.addImage(imgId, {
                        tl: { col: 0, row: 0 },
                        ext: { width: dispW, height: dispH }
                    });
                }
                await imgWb.xlsx.writeFile(savePath);
                setStatus(`已转为 Excel（图像版）→ ${path.basename(savePath)}（${pages.length} 页图像，原 PDF 无文本层）`, 'success');
                return;
            }

            XLSX.writeFile(wb, savePath);
            setStatus(`已转为 Excel（文本版）→ ${path.basename(savePath)}`, 'success');
        }

        // 11. PDF 转 PPT
        async function pdfToPpt() {
            if (!requireFiles(1)) return;
            const savePath = await askSavePath(`${srcBaseName()}.pptx`, 'pptx');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            setStatus('正在渲染页面…');
            const srcBytes = fs.readFileSync(state.files[0].path);
            const loadingTask = pdfjs.getDocument({ data: srcBytes });
            const pdf = await loadingTask.promise;
            const total = pdf.numPages;
            const opts = state.options['pdf2ppt'] || {};
            const pages = resolvePages(total, opts);
            // PPT 输出本就是页面图像，mode 选项保留但两种取值均走图像路径
            const scale = 150 / 72; // 固定 150 DPI

            const pres = new pptxgen();
            pres.defineLayout({ name: 'PDF', width: 10, height: 7.5 });
            pres.layout = 'PDF';

            for (const p of pages) {
                setStatus(`渲染中: 第 ${p}/${total} 页`);
                const page = await pdf.getPage(p);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/png');
                const slide = pres.addSlide();
                // 按页面原始比例缩放并居中，避免拉伸失真（addImage 的 x/y/w/h 为顶层字段，勿包进 options）
                const r = canvas.width / canvas.height;
                const sR = 10 / 7.5;
                let w, h;
                if (r > sR) { w = 10; h = 10 / r; } else { h = 7.5; w = 7.5 * r; }
                slide.addImage({ data: dataUrl, x: (10 - w) / 2, y: (7.5 - h) / 2, w, h });
            }

            const buf = await pres.write({ outputType: 'nodebuffer' });
            fs.writeFileSync(savePath, buf);
            setStatus(`已转为 PPT → ${path.basename(savePath)}（${pages.length} 页）`, 'success');
        }

        // 12. Office 转 PDF
        async function officeToPdf() {
            if (!requireFiles(1)) return;
            const srcPath = state.files[0].path;
            const ext = path.extname(srcPath).toLowerCase().replace(/^\./, '');
            const savePath = await askSavePath(`${srcBaseName()}.pdf`, 'pdf');
            if (!savePath) { setStatus('已取消'); return; }
            setBusy(true);
            // mode=layout（默认）→ 优先 LibreOffice 高保真；mode=edit → 跳过 LibreOffice 走纯 JS 降级
            // 注：pageRange 对 Office 源文档无效（页数由源文档分页决定），选项保留但 inert
            const opts = state.options['office2pdf'] || {};
            const useLibre = opts.mode !== 'edit';

            // 主路径：LibreOffice（仅 layout 模式才尝试）
            if (useLibre) {
                const librePath = await window.electron.detectLibreOffice();
                if (librePath) {
                    setStatus('使用 LibreOffice 转换中…');
                    try {
                        const res = await window.electron.officeToPdf(srcPath);
                        if (res && res.ok && res.outPath) {
                            const pdfBytes = fs.readFileSync(res.outPath);
                            fs.writeFileSync(savePath, pdfBytes);
                            try { fs.unlinkSync(res.outPath); } catch (_) {}
                            setStatus(`已转换 → ${path.basename(savePath)}`, 'success');
                            return;
                        }
                        setStatus('LibreOffice 转换失败，尝试降级…', 'busy');
                    } catch (e) {
                        setStatus('LibreOffice 调用失败，尝试降级…', 'busy');
                    }
                }
            }

            // 降级路径
            try {
                if (ext === 'docx' || ext === 'doc') {
                    setStatus('使用 mammoth 降级转换…');
                    const result = await mammoth.convertToHtml({ path: srcPath });
                    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 14px; line-height: 1.7; padding: 16px; }
h1,h2,h3 { color: #1f2328; } table { border-collapse: collapse; } th,td { border: 1px solid #d0d7de; padding: 6px 13px; }
code,pre { background: #f6f8fa; font-family: ui-monospace, monospace; }
</style></head><body>${result.value}</body></html>`;
                    const pdfBuf = await ipcRenderer.invoke('md-to-pdf', html, { pageSize: 'A4' });
                    if (!pdfBuf) throw new Error('PDF 生成返回空');
                    fs.writeFileSync(savePath, Buffer.from(pdfBuf));
                    setStatus(`已转换（Word 降级）→ ${path.basename(savePath)}`, 'success');
                    return;
                } else if (ext === 'xlsx' || ext === 'xls') {
                    setStatus('使用 xlsx 降级转换…');
                    const wb = XLSX.readFile(srcPath, { type: 'file' });
                    let html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; padding: 16px; }
table { border-collapse: collapse; } td,th { border: 1px solid #888; padding: 4px 8px; }
</style></head><body>`;
                    for (const sn of wb.SheetNames) {
                        const ws = wb.Sheets[sn];
                        html += `<h2>${sn}</h2>` + XLSX.utils.sheet_to_html(ws, { editable: false });
                    }
                    html += '</body></html>';
                    const pdfBuf = await ipcRenderer.invoke('md-to-pdf', html, { pageSize: 'A4' });
                    if (!pdfBuf) throw new Error('PDF 生成返回空');
                    fs.writeFileSync(savePath, Buffer.from(pdfBuf));
                    setStatus(`已转换（Excel 降级）→ ${path.basename(savePath)}`, 'success');
                    return;
                } else if (ext === 'pptx' || ext === 'ppt') {
                    setStatus('PPT 转 PDF 需安装 LibreOffice', 'error');
                    alert('PowerPoint 转 PDF 需要安装 LibreOffice。\n\n请安装 LibreOffice 后重试，或先转为图片再合成 PDF。\n\n注：PPT 暂无纯 JS 降级路径，即使选择「编辑优先」也需要 LibreOffice。');
                    return;
                } else {
                    setStatus('不支持的文件类型: .' + ext, 'error');
                    alert('不支持的文件类型: .' + ext);
                    return;
                }
            } catch (e) {
                setStatus('转换失败: ' + (e.message || e), 'error');
                alert('转换失败: ' + (e.message || e));
            }
        }

        // --- 执行调度 ---
        const EXECUTORS = {
            pdf2word: pdfToWord, pdf2excel: pdfToExcel, pdf2ppt: pdfToPpt, pdf2img: pdfToImages,
            office2pdf: officeToPdf, split: splitPdf, merge: mergePdfs, extract: extractPages,
            delete: deletePages, compress: compressPdf, encrypt: encryptPdf, decrypt: decryptPdf
        };

        async function runCurrent() {
            const fn = EXECUTORS[state.tab];
            if (!fn) return;
            try {
                await fn();
            } catch (e) {
                console.error('[PdfToolbox] error:', e);
                setStatus('失败: ' + (e.message || e), 'error');
                alert('失败: ' + (e.message || e));
            } finally {
                setBusy(false);
            }
        }

        // --- 事件绑定 ---
        $tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
        $filePick.addEventListener('click', pickFiles);
        $clearBtn.addEventListener('click', () => { state.files = []; renderFileList(); setStatus('已清空'); });
        $drop.addEventListener('click', pickFiles);
        $drop.addEventListener('dragover', onDragOver);
        $drop.addEventListener('dragleave', onDragLeave);
        $drop.addEventListener('drop', onDrop);
        $run.addEventListener('click', runCurrent);

        // --- 初始化 ---
        switchTab('pdf2word');

        // --- 清理 ---
        window.onToolUnload = () => {
            // 移除拖拽监听（其他 listener 随 innerHTML 清空）
            if ($drop) {
                $drop.removeEventListener('click', pickFiles);
                $drop.removeEventListener('dragover', onDragOver);
                $drop.removeEventListener('dragleave', onDragLeave);
                $drop.removeEventListener('drop', onDrop);
            }
        };
    }
};
