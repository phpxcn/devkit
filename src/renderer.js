/**
 * 开发者工具箱 - 渲染进程主控脚本 (Renderer)
 * 负责 UI 事件监听、工具实例化与逻辑分发
 */
window.onerror = function(msg, url, line) {
    alert(`[脚本错误] ${msg}\n位置: ${line}行\n请尝试刷新窗口。`);
};

// 1. 加载核心模块 (依赖 nodeIntegration: true)
const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const JsonTool = require('./src/tools/JsonTool');
const JSONTreeView = require('./src/ui/JSONTreeView');
const TimestampTool = require('./src/tools/TimestampTool');
const TableDataset = require('./src/models/TableDataset');
const { CSVConverter, ExcelConverter } = require('./src/converters/TableConverters');
const MarkdownConverter = require('./src/converters/MarkdownConverter');
const { SQLConverter, HTMLConverter, JSONConverter, XMLConverter, YAMLConverter, ASCIIConverter } = require('./src/converters/MoreConverters');

// 2. 实例化工具
const jsonTool = new JsonTool();
const tsTool = new TimestampTool();
let tableDataset = new TableDataset();
const unifiedEditor = document.getElementById('unified-json-editor');
const jsonTreeView = new JSONTreeView(unifiedEditor);

// 3. 页面切换逻辑
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.tool-page');
const pageTitleElem = document.getElementById('page-title');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const pageId = item.dataset.page;
        
        // 更新内侧边栏 UI
        navItems.forEach(ni => ni.classList.remove('active'));
        item.classList.add('active');
        
        // 切换页面
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        
        // 更新顶部标题
        pageTitleElem.textContent = item.querySelector('span:last-child').textContent;
    });
});

// ==========================================
// 4. JSON 工具逻辑 (统一富文本同框模式)
// ==========================================
const jsonInput = document.getElementById('json-input');
const jsonInputH = document.getElementById('json-input-h');
// (实例化已移至顶部)

const btnFormat = document.getElementById('btn-format');
const btnCompress = document.getElementById('btn-compress');
const btnClearJson = document.getElementById('btn-clear-json');
const btnCopyJson = document.getElementById('btn-copy-json');

// 语法高亮引擎 (供左侧输入展示使用)
function highlightJson(text) {
    if (!text) return '';
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return text.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[\[\]\{\},])/g, (match) => {
        let cls = 'token-default';
        if (/^"/.test(match)) {
            cls = /:$/.test(match) ? 'token-key' : 'token-string';
        } else if (/true|false/.test(match)) {
            cls = 'token-boolean';
        } else if (/null/.test(match)) {
            cls = 'token-null';
        } else if (/[0-9]/.test(match)) {
            cls = 'token-number';
        } else if (/[\[\]\{\}]/.test(match)) {
            cls = 'token-bracket';
        } else if (match === ',') {
            cls = 'token-comma';
        }
        return `<span class="${cls}">${match}</span>`;
    });
}

// 自动向背景层同步滚动
jsonInput.onscroll = () => {
  jsonInputH.scrollTop = jsonInput.scrollTop;
  jsonInputH.scrollLeft = jsonInput.scrollLeft;
};

// 实时响应：刷新高亮展示层 + 刷新右侧折叠编辑器
jsonInput.addEventListener('input', () => {
    const val = jsonInput.value;
    jsonInputH.innerHTML = highlightJson(val) + '\n';
    
    if (!val.trim()) {
        unifiedEditor.innerHTML = '<div style="color: #64748b; padding: 20px;">等待数据录入...</div>';
        return;
    }
    try {
        const obj = jsonTool.parseJSON(val);
        jsonTreeView.render(obj);
    } catch (e) {}
});

btnFormat.addEventListener('click', () => {
    try {
        const val = jsonInput.value;
        const formatted = jsonTool.format(val);
        jsonInput.value = formatted;
        jsonInputH.innerHTML = highlightJson(formatted) + '\n';
        jsonTreeView.render(jsonTool.parseJSON(formatted));
    } catch (e) { alert(e.message); }
});

btnCompress.addEventListener('click', () => {
    try {
        const val = jsonInput.value;
        const compressed = jsonTool.compress(val);
        jsonInput.value = compressed;
        jsonInputH.innerHTML = highlightJson(compressed) + '\n';
        jsonTreeView.render(jsonTool.parseJSON(compressed));
    } catch (e) { alert(e.message); }
});

btnClearJson.addEventListener('click', () => {
    jsonInput.value = '';
    jsonInputH.innerHTML = '';
    unifiedEditor.innerHTML = '<div style="color: #64748b; padding: 20px;">等待数据录入...</div>';
});

// 通用复制工具：优先使用浏览器 API，Electron IPC 兜底
async function copyToClipboard(text) {
    try {
        // 方案 A: 现代浏览器 API (最直接)
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) { console.error('Navigator clipboard failed:', e); }

    try {
        // 方案 B: Electron 主进程 IPC (在非安全上下文或特殊策略下生效)
        if (window.electron && window.electron.writeClipboard) {
            await window.electron.writeClipboard(text);
            return true;
        }
    } catch (e) { console.error('Electron IPC clipboard failed:', e); }

    return false;
}

btnCopyJson.addEventListener('click', async () => {
    const val = jsonInput.value.trim();
    if (!val) {
        alert('请输入内容后再复制！');
        return;
    }

    try {
        let textToCopy = val;
        try {
            // 尝试格式化后再复制
            const obj = jsonTool.parseJSON(val);
            textToCopy = JSON.stringify(obj, null, 2);
        } catch (e) { /* 解析失败，则复制原样 */ }

        const success = await copyToClipboard(textToCopy);
        if (success) {
            alert('已成功复制结果到剪贴板！');
        } else {
            alert('复制失败，请手动选择并复制。');
        }
    } catch (err) {
        alert('复制过程中出错: ' + err.message);
    }
});

// ==========================================
// 5. 表格转换逻辑
// ==========================================
const tableInput = document.getElementById('table-input');
const tableGridView = document.getElementById('table-grid-view');
const tableStats = document.getElementById('table-stats');
const tableFormatTabs = document.querySelectorAll('#table-format-tabs .tab-item');
const tableConfigContainer = document.getElementById('table-config-container');

let currentTableFormat = 'csv'; 
let currentTableOptions = {}; // 存储当前各格式的配置项

// --- 1. 配置模式定义 (各格式特定的渲染 Schema) ---
const TableConfigSchemas = {
    json: [
        { id: 'parseJson', type: 'checkbox', label: '解析 JSON 内容', desc: '智能解析单元格中的 JSON 字符串为对象', default: true },
        { id: 'compact', type: 'checkbox', label: '压缩输出', desc: '生成紧凑的单行 JSON 格式', default: false },
        { id: 'dataFormat', type: 'select', label: '数据格式', options: ['Array of Objects', '2D Array', 'Column Array', 'Keyed Array'], default: 'Array of Objects' },
        { id: 'rootName', type: 'text', label: '根对象名称', default: '' },
        { id: 'indent', type: 'select', label: '缩进大小', options: ['2 spaces', '4 spaces', '8 spaces', 'Tabs'], default: '2 spaces' }
    ],
    xlsx: [
        { id: 'textMode', type: 'checkbox', label: '文本格式', desc: '将所有数据强制导出为文本内容', default: false },
        { id: 'autoWidth', type: 'checkbox', label: '自动列宽', desc: '根据内容自动调整列宽', default: true },
        { id: 'protectSheet', type: 'checkbox', label: '保护工作表', desc: '启用工作表保护, 密码 devkit2026', default: false },
        { id: 'sheetName', type: 'text', label: '工作表名称', default: 'Sheet1' }
    ],
    csv: [
        { id: 'quoteAll', type: 'checkbox', label: '双引号包装', desc: '所有数值都会被双引号包含', default: false },
        { id: 'useBom', type: 'checkbox', label: 'UTF-8 BOM', desc: '添加 UTF8 字节顺序标记以帮助 Excel 识别', default: true },
        { id: 'delimiter', type: 'select', label: '值分隔符', options: [
            { label: 'Comma (,)', value: ',' },
            { label: 'Tab (\\t)', value: '\t' },
            { label: 'Semicolon (;)', value: ';' },
            { label: 'Colon (:)', value: ':' },
            { label: 'Pipe (|)', value: '|' },
            { label: 'Slash (/)', value: '/' }
        ], default: ',' },
        { id: 'rowDelimiter', type: 'select', label: '行分隔符', options: [
            { label: 'Newline (\\n)', value: '\n' },
            { label: 'Comma (,)', value: ',' },
            { label: 'Tab (\\t)', value: '\t' },
            { label: 'Pipe (|)', value: '|' }
        ], default: '\n' },
        { id: 'prefix', type: 'text', label: '行前缀', default: '' },
        { id: 'suffix', type: 'text', label: '行后缀', default: '' }
    ],
    md: [
        { id: 'escapeMd', type: 'checkbox', label: '转义字符', desc: '转义 Markdown 特殊字符（*、_、|、\\ 等）', default: true },
        { id: 'firstRowHeader', type: 'checkbox', label: '首行表头', default: true },
        { id: 'prettyMd', type: 'checkbox', label: '美化 Markdown 表格', default: true },
        { id: 'simpleMd', type: 'checkbox', label: '简化表格', desc: '移除两侧边线', default: false },
        { id: 'addRowNum', type: 'checkbox', label: '添加行号', default: false },
        { id: 'boldHeader', type: 'checkbox', label: '首行加粗', default: true },
        { id: 'boldFirstCol', type: 'checkbox', label: '首列加粗', default: false },
        { id: 'align', type: 'select', label: '文本对齐', options: ['Left', 'Center', 'Right'], default: 'Left' },
        { id: 'multiLine', type: 'select', label: '多行处理', options: [
            { label: 'Preserve (<br>)', value: 'preserve' },
            { label: 'Escape (\\n)', value: 'escape' },
            { label: 'Break Lines', value: 'break' }
        ], default: 'preserve' }
    ],
    sql: [
        { id: 'createTable', type: 'checkbox', label: '创建表 (CREATE TABLE)', default: true },
        { id: 'batchInsert', type: 'checkbox', label: '批量插入', default: true },
        { id: 'dropTable', type: 'checkbox', label: '删除表 (如果存在)', default: false },
        { id: 'dbType', type: 'select', label: '数据库类型', options: ['MySQL', 'PostgreSQL', 'SQLite', 'SQLServer'], default: 'MySQL' },
        { id: 'tableName', type: 'text', label: '表名', default: 'myTable' },
        { id: 'primaryKey', type: 'text', label: '主键', default: 'id' }
    ],
    html: [
        { id: 'escapeHtml', type: 'checkbox', label: '转义 HTML 字符', default: true },
        { id: 'useDiv', type: 'checkbox', label: 'DIV 表格', desc: '使用 DIV+CSS 代替传统 TABLE', default: false },
        { id: 'minify', type: 'checkbox', label: '压缩代码', default: false },
        { id: 'tbody', type: 'checkbox', label: '标准表头布局 (thead/tbody)', default: true },
        { id: 'colHeader', type: 'checkbox', label: '列表头 (第一列作为 th)', default: false },
        { id: 'caption', type: 'text', label: '表格标题 (caption)', default: '' },
        { id: 'className', type: 'text', label: '表格 CSS 类名', default: 'table-custom' },
        { id: 'tableId', type: 'text', label: '表格 ID', default: 'my-table' }
    ],
    xml: [
        { id: 'escapeXml', type: 'checkbox', label: '转义 XML 字符', default: true },
        { id: 'compactXml', type: 'checkbox', label: '压缩输出', default: false },
        { id: 'declaration', type: 'checkbox', label: 'XML 声明头', default: true },
        { id: 'attributeMode', type: 'checkbox', label: '属性模式', desc: '输出为属性而非子元素', default: false },
        { id: 'cdata', type: 'checkbox', label: 'CDATA 包装', default: false },
        { id: 'indent', type: 'select', label: '缩进大小', options: ['2 spaces', '4 spaces', '8 spaces', 'Tabs'], default: '2 spaces' },
        { id: 'encoding', type: 'select', label: '编码', options: ['UTF-8', 'UTF-16', 'ISO-8859-1'], default: 'UTF-8' },
        { id: 'rootNode', type: 'text', label: '根元素', default: 'dataset' },
        { id: 'rowNode', type: 'text', label: '行元素', default: 'record' }
    ],
    yaml: [
        { id: 'style', type: 'select', label: '数组样式', options: [
            { label: 'Block style (逐行)', value: 'block' },
            { label: 'Flow style (内联)', value: 'flow' }
        ], default: 'block' },
        { id: 'quotes', type: 'select', label: '引号样式', options: [
            { label: 'No quotes', value: 'none' },
            { label: 'Single quotes', value: 'single' },
            { label: 'Double quotes', value: 'double' }
        ], default: 'none' },
        { id: 'indent', type: 'select', label: '缩进大小', options: ['2 spaces', '4 spaces', '8 spaces'], default: '2 spaces' }
    ],
    ascii: [
        { id: 'borderStyle', type: 'select', label: '边框样式', options: [
            { label: 'ASCII (mysql)', value: 'mysql' },
            { label: 'ASCII (separated)', value: 'separated' },
            { label: 'ASCII (horizontal)', value: 'horizontal' },
            { label: 'ASCII (compact)', value: 'compact' },
            { label: 'ASCII (dots)', value: 'dots' },
            { label: 'ASCII (rounded)', value: 'rounded' },
            { label: 'Unicode (double)', value: 'unicode_double' },
            { label: 'Unicode (single line)', value: 'unicode_single' },
            { label: 'reStructuredText Grid', value: 'rst_grid' },
            { label: 'reStructuredText Simple', value: 'rst_simple' }
        ], default: 'mysql' },
        { id: 'commentWrap', type: 'select', label: '注释包装', options: [
            { label: 'No comment', value: '' },
            { label: '// C++/JS/Java', value: '//' },
            { label: '# Python/Ruby/R', value: '#' },
            { label: '-- SQL/Lua/Ada', value: '--' },
            { label: '% MATLAB', value: '%' },
            { label: '/* ... */ CSS', value: '/* */' },
            { label: '<!-- ... --> HTML/XML', value: '<!-- -->' }
        ], default: '' },
        { id: 'align', type: 'select', label: '文本对齐', options: ['Left', 'Center', 'Right'], default: 'Left' }
    ],
    latex: [
        { id: 'escapeLatex', type: 'checkbox', label: '转义 LaTeX 表格字符', default: true },
        { id: 'floating', type: 'checkbox', label: '浮动位置', default: true },
        { id: 'fullDoc', type: 'checkbox', label: '完整文档', default: false },
        { id: 'boldHeader', type: 'checkbox', label: '首行加粗', default: true },
        { id: 'boldFirstPage', type: 'checkbox', label: '首页加粗', default: false },
        { id: 'tableAlign', type: 'select', label: '表格对齐 (环境)', options: [
            { label: 'Center', value: 'c' },
            { label: 'Left', value: 'l' },
            { label: 'Right', value: 'r' }
        ], default: 'c' },
        { id: 'textAlign', type: 'select', label: '文本对齐 (列)', options: [
            { label: 'Left', value: 'l' },
            { label: 'Center', value: 'c' },
            { label: 'Right', value: 'r' }
        ], default: 'l' },
        { id: 'refLabel', type: 'text', label: '引用标签 (label)', default: 'tab:my_table' },
        { id: 'borderStyle', type: 'select', label: '边框样式', options: [
            { label: 'All Borders', value: 'all' },
            { label: 'MySQL Style', value: 'mysql' },
            { label: 'Excel Style', value: 'excel' },
            { label: 'Horizontal Only', value: 'horizontal' },
            { label: 'Markdown Style', value: 'markdown' },
            { label: 'Compact', value: 'compact' },
            { label: 'None', value: 'none' }
        ], default: 'all' },
        { id: 'caption', type: 'text', label: '表格标题', default: '' },
        { id: 'captionPos', type: 'select', label: '标题位置', options: ['Above', 'Below'], default: 'Above' },
        { id: 'envType', type: 'select', label: '表格类型 (Environment)', options: ['tabular', 'longtable', 'tabularx'], default: 'tabular' }
    ]
};

// 更新行列统计
function updateTableStats() {
    if (!tableDataset) return;
    const r = tableDataset.rows.length;
    const c = tableDataset.headers.length;
    tableStats.textContent = `${r} x ${c}`;
}

// --- 2. 动态逻辑：渲染配置面板 ---
function renderTableConfig(format) {
    const schemas = TableConfigSchemas[format];
    const defaultHint = '将鼠标悬停在选项上可查看详细说明';
    
    if (!schemas) {
        tableConfigContainer.innerHTML = '<div class="empty-state">该格式暂无特殊配置</div>';
        return;
    }

    // 初始化默认值
    if (!currentTableOptions[format]) {
        currentTableOptions[format] = {};
        schemas.forEach(s => currentTableOptions[format][s.id] = s.default);
    }

    // 分类渲染：复选框一组，其他输入框(双栏)一组
    const checkboxes = schemas.filter(s => s.type === 'checkbox');
    const others = schemas.filter(s => s.type !== 'checkbox');

    let html = '<div class="config-wrapper">';

    // 1. 渲染复选框区域
    if (checkboxes.length > 0) {
        html += '<div class="config-checkbox-group">';
        checkboxes.forEach(s => {
            const checked = currentTableOptions[format][s.id] ? 'checked' : '';
            const tipIcon = s.desc ? `<i class="config-id-icon" data-tip="${s.desc}">i</i>` : '';
            html += `
                <div class="checkbox-item" data-tip-source="${s.desc || ''}">
                    <label class="f-checkbox-label">
                        <input type="checkbox" data-id="${s.id}" ${checked}>
                        <span class="checkbox-box"></span>
                        <span class="checkbox-text">${s.label}</span>
                        ${tipIcon}
                    </label>
                </div>`;
        });
        html += '</div>';
    }

    // 2. 渲染输入框网格区域 (双栏)
    if (others.length > 0) {
        html += '<div class="config-grid-group">';
        others.forEach(s => {
            const tipIcon = s.desc ? `<i class="config-id-icon" data-tip="${s.desc}">i</i>` : '';
            html += `
                <div class="grid-item" data-tip-source="${s.desc || ''}">
                    <div class="item-label-row">
                        <span class="item-label">${s.label}</span>
                        ${tipIcon}
                    </div>`;
            
            if (s.type === 'select') {
                html += `<select class="f-select-modern" data-id="${s.id}">`;
                s.options.forEach(opt => {
                    const val = (typeof opt === 'object') ? opt.value : opt;
                    const lab = (typeof opt === 'object') ? opt.label : opt;
                    const selected = (currentTableOptions[format][s.id] === val) ? 'selected' : '';
                    html += `<option value="${val}" ${selected}>${lab}</option>`;
                });
                html += `</select>`;
            } else if (s.type === 'text') {
                html += `<input type="text" class="f-input-modern" data-id="${s.id}" value="${currentTableOptions[format][s.id] || ''}">`;
            }
            html += `</div>`;
        });
        html += '</div>';
    }

    html += '</div>'; // End wrapper

    // 组装最终面板：滚动列表 + 固定说明栏
    tableConfigContainer.innerHTML = `
        <div id="table-config-list">${html}</div>
        <div class="config-desc-wrapper">
            <span class="config-desc-title">选项说明 / DESCRIPTION</span>
            <p class="config-desc-text" id="config-hint-text">${defaultHint}</p>
        </div>
    `;

    const hintText = document.getElementById('config-hint-text');

    // 绑定事件：更新选项
    tableConfigContainer.querySelectorAll('input, select').forEach(el => {
        const handleEvent = () => {
            currentTableOptions[format][el.dataset.id] = el.type === 'checkbox' ? el.checked : el.value;
            refreshTablePreview();
        };
        el.addEventListener('input', handleEvent);
        el.addEventListener('change', handleEvent);
    });

    // 绑定事件：点开感应
    tableConfigContainer.querySelectorAll('[data-tip-source]').forEach(item => {
        const tip = item.dataset.tipSource;
        if (!tip) return;
        item.addEventListener('mouseenter', () => {
            hintText.textContent = tip;
            hintText.style.color = '#fff';
        });
        item.addEventListener('mouseleave', () => {
            hintText.textContent = defaultHint;
            hintText.style.color = 'var(--text-dim)';
        });
    });
}

// 渲染上方网格预览
function renderGrid() {
    if (!tableDataset || tableDataset.rows.length === 0) {
        tableGridView.innerHTML = '<div class="empty-state">等待数据中...</div>';
        return;
    }
    let html = '<table class="preview-table"><thead><tr>';
    tableDataset.headers.forEach((h, i) => {
        html += `<th contenteditable="true" data-col="${i}">${h || ''}</th>`;
    });
    html += '</tr></thead><tbody>';
    tableDataset.rows.slice(0, 100).forEach((row, ri) => {
        html += '<tr>';
        row.forEach((cell, ci) => {
            html += `<td contenteditable="true" data-row="${ri}" data-col="${ci}">${cell || ''}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    
    if (tableDataset.rows.length > 100) {
        html += `<div style="padding:10px; color:var(--text-dim); text-align:center; font-size:0.8rem;">仅预览前 100 行...</div>`;
    }
    tableGridView.innerHTML = html;

    // 绑定网格编辑实时同步与撤销记录
    const cells = tableGridView.querySelectorAll('[contenteditable]');
    cells.forEach(cell => {
        // 修改时序：不再在 focus 时存快照 (因为那时还没变)，改在 blur 后存
        cell.addEventListener('focus', () => {
            // focus 仅高亮或激活，不参与历史记录
        });
        
        cell.addEventListener('input', () => {
            const r = cell.dataset.row;
            const c = cell.dataset.col;
            const val = cell.textContent;
            if (r === undefined) tableDataset.headers[c] = val;
            else tableDataset.rows[r][c] = val;
            refreshTablePreview(); 
        });

        // 失去焦点意味着当前单元格编辑动作彻底结束，存一笔记录
        cell.addEventListener('blur', () => {
             tableDataset.saveToHistory();
             updateTableStats();
        });
    });
    updateTableStats();
}

// 获取只读预览网格 HTML (用于 Excel 展示)
function getReadOnlyGridHtml() {
    let html = '<table class="preview-table"><thead><tr>';
    tableDataset.headers.forEach(h => html += `<th>${h || '-'}</th>`);
    html += '</tr></thead><tbody>';
    tableDataset.rows.slice(0, 50).forEach(row => {
        html += '<tr>';
        row.forEach(cell => html += `<td>${cell || ''}</td>`);
        html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

// 超级预览引擎：根据当前选择的格式刷新文本框或展示层
async function refreshTablePreview() {
    if (!tableDataset) return;
    const format = currentTableFormat;
    const resultArea = document.querySelector('.result-area');
    const options = currentTableOptions[format] || {}; 

    try {
        if (format === 'xlsx' || format === 'pdf') {
            resultArea.innerHTML = `<div style="height:100%; overflow:auto; padding:20px; border:1px solid rgba(255,255,255,0.05); background:#0b0c14;">
                <div style="font-weight:600; color:var(--accent-color); margin-bottom:12px; font-size:0.85rem;">📊 ${format.toUpperCase()} 转换结果实时镜像预览 :</div>
                ${getReadOnlyGridHtml()}
            </div>`;
        } else {
            // 确保渲染了文本域
            let tableInputObj = document.getElementById('table-input');
            if (!tableInputObj) {
                resultArea.innerHTML = `<textarea id="table-input" class="f-textarea" placeholder="转换结果将在此实时显示..."></textarea>`;
                tableInputObj = document.getElementById('table-input');
            }
            
            let preview = "";
            if (format === 'csv') preview = CSVConverter.export(tableDataset, options);
            else if (format === 'md') preview = (typeof MarkdownConverter.exportSync === 'function') ? MarkdownConverter.exportSync(tableDataset, options) : MarkdownConverter.export(tableDataset, options);
            else if (format === 'json') preview = JSONConverter.export(tableDataset, options);
            else if (format === 'sql') preview = SQLConverter.export(tableDataset, options);
            else if (format === 'html') preview = HTMLConverter.export(tableDataset, options);
            else if (format === 'xml') preview = XMLConverter.export(tableDataset, options);
            else if (format === 'yaml') preview = YAMLConverter.export(tableDataset, options);
            else if (format === 'ascii') preview = ASCIIConverter.export(tableDataset, options);
            else if (format === 'latex') preview = LaTeXConverter.export(tableDataset, options);
            
            tableInputObj.value = preview;
            // 自动调整高度以撑开页面滚动条
            tableInputObj.style.height = 'auto';
            tableInputObj.style.height = (tableInputObj.scrollHeight) + 'px';
        }
    } catch (e) {
        resultArea.innerHTML = `<div style="color:var(--accent-color); padding:20px;">预览更新中: ${e.message}</div>`;
    }
}

// --- 监听：右侧操作矩阵 ---

// --- 监听：已移至下方统一管理 ---

// 设为标题 (将第一行推广为 Headers)
document.getElementById('btn-set-header')?.addEventListener('click', () => {
    if (tableDataset && tableDataset.rows.length > 0) {
        tableDataset.saveToHistory();
        const newHeaders = tableDataset.rows[0].map(v => String(v || ''));
        tableDataset.headers = newHeaders;
        tableDataset.rows.shift();
        tableDataset.updateMetadata();
        syncTableAll();
    }
});

// 清空表格
document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (tableDataset) {
        tableDataset.saveToHistory();
        tableDataset.headers = ['A', 'B', 'C'];
        tableDataset.rows = [['', '', ''], ['', '', ''], ['', '', '']];
        tableDataset.updateMetadata();
        syncTableAll();
    }
});

// 复制结果
document.getElementById('btn-copy-result')?.addEventListener('click', () => {
    const input = document.getElementById('table-input');
    if (input) {
        input.select();
        document.execCommand('copy');
        
        const btn = document.getElementById('btn-copy-result');
        const oldText = btn.textContent;
        btn.textContent = '已复制!';
        setTimeout(() => btn.textContent = oldText, 2000);
    }
});

// 下载结果
document.getElementById('btn-download-result')?.addEventListener('click', () => {
    // 简单导出当前文本预览为文件
    const format = currentTableFormat;
    const content = document.getElementById('table-input')?.value;
    if (!content) return;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export.${format === 'xlsx' ? 'csv' : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// 监听 Tab 切换
tableFormatTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tableFormatTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTableFormat = tab.dataset.format;
        renderTableConfig(currentTableFormat); // 刷新配置面板
        refreshTablePreview();
    });
});

// 初始化：默认渲染第一个格式的配置
renderTableConfig(currentTableFormat);

// --- 辅助：网格事件绑定重构 ---
function attachGridListeners() {
    tableGridView.querySelectorAll('.f-cell-input').forEach(el => {
        el.addEventListener('focus', () => {
            // 这里是关键：在修改前存快照
            tableDataset.saveToHistory();
        });
        el.addEventListener('blur', () => {
            const r = el.dataset.row;
            const c = el.dataset.col;
            const val = el.innerText;
            if (r === undefined) tableDataset.headers[c] = val;
            else tableDataset.rows[r][c] = val;
            syncTableAll();
        });
    });
}

// 统一的网格与预览刷新
function syncTableAll() {
    renderGrid();
    refreshTablePreview();
}

// --- 3. 核心交互：工具栏与数据操作 ---

// 统一同步预览与网格
function syncTableAll() {
    renderGrid();
    refreshTablePreview();
    if (typeof updateTableStats === 'function') updateTableStats();
}

// 撤销/重做
document.getElementById('btn-undo-f')?.addEventListener('click', () => {
    if (tableDataset.undo()) syncTableAll();
});
document.getElementById('btn-redo-f')?.addEventListener('click', () => {
    if (tableDataset.redo()) syncTableAll();
});

// 行列转置
document.getElementById('btn-transpose-f')?.addEventListener('click', () => {
    tableDataset.transpose(); // 内部已含 saveToHistory
    syncTableAll();
});

// 大写转换
document.getElementById('btn-upper-f')?.addEventListener('click', () => {
    tableDataset.saveToHistory();
    tableDataset.rows = tableDataset.rows.map(r => r.map(c => String(c).toUpperCase()));
    syncTableAll();
});

// 小写转换
document.getElementById('btn-lower-f')?.addEventListener('click', () => {
    tableDataset.saveToHistory();
    tableDataset.rows = tableDataset.rows.map(r => r.map(c => String(c).toLowerCase()));
    syncTableAll();
});

// 去除重复
document.getElementById('btn-remove-dup-f')?.addEventListener('click', () => {
    tableDataset.removeDuplicates(); // 内部已含 saveToHistory
    syncTableAll();
});

// 设为标题 (将首行导出为 Headers)
document.getElementById('btn-header-f')?.addEventListener('click', () => {
    if (tableDataset.rows.length > 0) {
        tableDataset.saveToHistory();
        tableDataset.headers = tableDataset.rows[0].map(v => String(v || ''));
        tableDataset.rows.shift();
        tableDataset.updateMetadata();
        syncTableAll();
    }
});

// 清空表格
document.getElementById('btn-clear-f')?.addEventListener('click', () => {
    tableDataset.clear(); // 内部已含 saveToHistory
    syncTableAll();
});

// 导入文件 (CSV / Excel)
document.getElementById('btn-import-f')?.addEventListener('click', async () => {
    try {
        const res = await ipcRenderer.invoke('show-open-dialog', {
            properties: ['openFile'],
            filters: [{ name: 'Table Files', extensions: ['csv', 'xlsx', 'xls', 'json'] }]
        });
        if (!res || res.canceled || !res.filePaths || res.filePaths.length === 0) return;
        
        const filePath = res.filePaths[0];
        const ext = filePath.split('.').pop().toLowerCase();
        let importedDS = null;

        if (ext === 'csv') {
            const content = fs.readFileSync(filePath, 'utf8');
            importedDS = await CSVConverter.import(content);
        } else if (['xlsx', 'xls'].includes(ext)) {
            const buffer = fs.readFileSync(filePath);
            importedDS = await ExcelConverter.import(buffer);
        }

        if (importedDS) {
            // 关键：通过 fromMatrix 更新现有实例以保留历史追溯 (内部已含 saveToHistory)
            tableDataset.fromMatrix(importedDS.toMatrix(true), true);
            syncTableAll();
        }
    } catch (e) {
        alert('文件导入失败: ' + e.message);
    }
});

// 导出与拷贝
document.getElementById('btn-copy-table')?.addEventListener('click', () => {
    const tableInputObj = document.getElementById('table-input');
    if (tableInputObj) {
        tableInputObj.select();
        document.execCommand('copy');
        const oldText = document.getElementById('btn-copy-table').textContent;
        document.getElementById('btn-copy-table').textContent = '已拷贝!';
        setTimeout(() => document.getElementById('btn-copy-table').textContent = oldText, 2000);
    }
});

document.getElementById('btn-export-f')?.addEventListener('click', async () => {
    const format = currentTableFormat;
    const savePath = await ipcRenderer.invoke('show-save-dialog', {
        title: '导出表格数据',
        defaultPath: `export.${format === 'xlsx' ? 'xlsx' : format}`
    });
    if (!savePath.filePath) return;

    try {
        let content;
        if (format === 'xlsx') {
            content = await ExcelConverter.export(tableDataset, currentTableOptions[format]);
        } else {
            content = document.getElementById('table-input')?.value;
        }
        
        if (content) {
            fs.writeFileSync(savePath.filePath, content);
            alert('导出成功！');
        }
    } catch (e) {
        alert('导出失败: ' + e.message);
    }
});

// 搜索替换
document.getElementById('btn-replace-all')?.addEventListener('click', () => {
    const s = document.getElementById('search-input')?.value;
    const r = document.getElementById('replace-input')?.value;
    if (!s || !tableDataset) return;

    tableDataset.saveToHistory();
    let count = 0;
    tableDataset.headers = tableDataset.headers.map(h => {
        if (h.includes(s)) { count++; return h.split(s).join(r); }
        return h;
    });
    tableDataset.rows = tableDataset.rows.map(row => row.map(c => {
        const sc = String(c);
        if (sc.includes(s)) { count++; return sc.split(s).join(r); }
        return c;
    }));
    
    if (count > 0) {
        syncTableAll();
        alert(`替换成功，共处理 ${count} 处。`);
    }
});

// 初始化完成
console.log('DevKit Table Tool Logic Finalized.');

// 实时同步：仅在 CSV 模式下允许反向编辑同步
tableInput.addEventListener('input', async () => {
    if (currentTableFormat !== 'csv') return;
    try {
        const val = tableInput.value;
        if (val.trim()) {
            tableDataset = await CSVConverter.import(val);
            renderGrid();
        }
    } catch (e) {}
});

// ==========================================
// 6. 时间戳逻辑
// ==========================================
const liveTsS = document.getElementById('live-ts-s');
const liveTsMs = document.getElementById('live-ts-ms');
const tsInput = document.getElementById('ts-input');
const btnConvertTs = document.getElementById('btn-convert-ts');

// 定时更新当前时间戳
setInterval(() => {
    const now = tsTool.getNow();
    liveTsS.textContent = now.seconds;
    liveTsMs.textContent = now.milliseconds % 1000;
}, 100);

btnConvertTs.addEventListener('click', () => {
    const val = tsInput.value.trim();
    if (!val) return;
    
    try {
        const res = tsTool.convert(val);
        document.getElementById('res-ts-s').textContent = res.seconds;
        document.getElementById('res-ts-ms').textContent = res.timestamp;
        document.getElementById('res-iso').textContent = res.iso;
        document.getElementById('res-local').textContent = res.local;
        document.getElementById('res-utc').textContent = res.utc;
        document.getElementById('res-type').textContent = res.type;
    } catch (e) {
        alert(e.message);
    }
});

// 支持回车快捷转换
tsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        btnConvertTs.click();
    }
});

// 一键复制事件绑定
document.querySelectorAll('.copy-ts-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const textToCopy = document.getElementById(targetId)?.textContent;
        if (textToCopy && textToCopy !== '-') {
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = btn.textContent;
                btn.textContent = '✅';
                setTimeout(() => btn.textContent = originalText, 1000);
            });
        }
    });
});

