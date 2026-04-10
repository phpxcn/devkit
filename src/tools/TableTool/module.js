const TableDataset = require('../../models/TableDataset');
const { CSVConverter, ExcelConverter } = require('../../converters/TableConverters');
const MarkdownConverter = require('../../converters/MarkdownConverter');
const { SQLConverter, HTMLConverter, JSONConverter, XMLConverter, YAMLConverter, ASCIIConverter, LaTeXConverter } = require('../../converters/MoreConverters');
const { ipcRenderer } = require('electron');
const fs = require('fs');

module.exports = {
    init: function() {
        let tableDataset = new TableDataset();
        let currentTableFormat = 'csv';
        let currentTableOptions = {};

        const sourceInputEditor = document.getElementById('source-input-editor');
        const sourceDataFormatSelect = document.getElementById('source-data-format');
        const tableGridView = document.getElementById('table-grid-view');
        const tableFormatTabs = document.querySelectorAll('#table-format-tabs .tab-item');
        const tableConfigContainer = document.getElementById('table-config-container');
        const tableInput = document.getElementById('table-input');

        // --- 核心工具函数 ---
        function updateTableStats() {
            const stats = tableDataset.getMetadata();
            const statsBtn = document.getElementById('table-stats');
            if (statsBtn) statsBtn.textContent = `${stats.rows} x ${stats.cols}`;
        }

        function syncTableAll() {
            renderGrid();
            refreshTablePreview();
            updateTableStats();
        }

        async function parseAndUpdateGrid(text) {
            if (!text.trim()) return;
            const sourceFormat = sourceDataFormatSelect?.value || 'csv';
            let parsedData = false;
            
            try {
                if (sourceFormat === 'csv' || sourceFormat === 'xlsx') {
                    const Papa = require('papaparse');
                    const results = Papa.parse(text, { header: false, skipEmptyLines: 'greedy' });
                    if (results.data && results.data.length > 0) {
                        tableDataset.fromMatrix(results.data, true);
                        parsedData = true;
                    }
                } else if (sourceFormat === 'md') {
                    const ds = await MarkdownConverter.import(text);
                    if (ds && ds.rows.length > 0) { tableDataset.fromMatrix(ds.toMatrix(true), true); parsedData = true; }
                } else if (['json', 'html', 'xml', 'yaml'].includes(sourceFormat)) {
                    const { JSONConverter, HTMLConverter, XMLConverter, YAMLConverter } = require('../../converters/MoreConverters');
                    let ds = null;
                    if (sourceFormat === 'json') ds = await JSONConverter.import(text);
                    else if (sourceFormat === 'html') ds = await HTMLConverter.import(text);
                    else if (sourceFormat === 'xml') ds = await XMLConverter.import(text);
                    else if (sourceFormat === 'yaml') ds = await YAMLConverter.import(text);

                    if (ds && ds.rows.length > 0) { tableDataset.fromMatrix(ds.toMatrix(true), true); parsedData = true; }
                }
                
                if (parsedData) syncTableAll();
            } catch(err) { console.error('解析出错:', err); }
        }

        // --- 网格渲染 ---
        function renderGrid() {
            if (!tableGridView) return;
            const stats = tableDataset.getMetadata();
            
            if (stats.rows === 0) {
                tableGridView.innerHTML = '<div class="empty-state">等待上方数据源接入</div>';
                return;
            }

            let html = '<table class="preview-table"><thead><tr>';
            tableDataset.headers.forEach((h, i) => {
                html += `<th contenteditable="true" class="f-cell-input" data-col="${i}">${h || ''}</th>`;
            });
            html += '</tr></thead><tbody>';

            tableDataset.rows.forEach((row, ri) => {
                html += '<tr>';
                row.forEach((cell, ci) => {
                    html += `<td contenteditable="true" class="f-cell-input" data-row="${ri}" data-col="${ci}">${cell || ''}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            tableGridView.innerHTML = html;
            attachGridListeners();
        }

        function attachGridListeners() {
            tableGridView.querySelectorAll('.f-cell-input').forEach(el => {
                el.addEventListener('focus', () => tableDataset.saveToHistory());
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

        // --- 预览刷新 ---
        async function refreshTablePreview() {
            if (!tableDataset) return;
            const format = currentTableFormat;
            const options = currentTableOptions[format] || {}; 
            const tableInputObj = document.getElementById('table-input');
            if (!tableInputObj) return;

            try {
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
            } catch (e) { console.error('Preview error:', e); }
        }

        // --- 配置渲染 ---
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

        function renderTableConfig(format) {
            if (!tableConfigContainer) return;
            const schema = TableConfigSchemas[format] || [];
            if (!currentTableOptions[format]) {
                currentTableOptions[format] = {};
                schema.forEach(item => currentTableOptions[format][item.id] = item.default);
            }

            let checkboxesHtml = '<div class="config-checkbox-group">';
            let gridHtml = '<div class="config-grid-group">';
            let hasCheckboxes = false;
            let hasGridItems = false;

            schema.forEach(item => {
                const descHtml = item.desc ? `<div class="item-desc" style="font-size:0.65rem; color:var(--text-dim); margin-top:2px; opacity:0.8;">${item.desc}</div>` : '';
                
                if (item.type === 'checkbox') {
                    hasCheckboxes = true;
                    checkboxesHtml += `
                        <div class="checkbox-item-wrapper" style="margin-bottom:12px;">
                            <label class="f-checkbox-label">
                                <input type="checkbox" data-id="${item.id}" ${currentTableOptions[format][item.id] ? 'checked' : ''}>
                                <div class="checkbox-box"></div>
                                <span class="checkbox-text">${item.label}</span>
                            </label>
                            ${descHtml}
                        </div>`;
                } else {
                    hasGridItems = true;
                    if (item.type === 'select') {
                        gridHtml += `
                            <div class="grid-item">
                                <span class="item-label-row">${item.label}</span>
                                <select class="f-select-modern" data-id="${item.id}">
                                    ${item.options.map(opt => {
                                        const val = typeof opt === 'object' ? opt.value : opt;
                                        const lab = typeof opt === 'object' ? opt.label : opt;
                                        return `<option value="${val}" ${currentTableOptions[format][item.id] == val ? 'selected' : ''}>${lab}</option>`;
                                    }).join('')}
                                </select>
                                ${descHtml}
                            </div>`;
                    } else if (item.type === 'text') {
                        gridHtml += `
                            <div class="grid-item">
                                <span class="item-label-row">${item.label}</span>
                                <input type="text" class="f-input-modern" data-id="${item.id}" value="${currentTableOptions[format][item.id] || ''}" placeholder="${item.default}">
                                ${descHtml}
                            </div>`;
                    }
                }
            });

            checkboxesHtml += '</div>';
            gridHtml += '</div>';

            let finalHtml = '<div class="config-wrapper" style="display:flex; flex-direction:column; gap:20px;">';
            if (hasCheckboxes) finalHtml += checkboxesHtml;
            if (hasGridItems) finalHtml += gridHtml;
            finalHtml += '</div>';

            tableConfigContainer.innerHTML = finalHtml;

            tableConfigContainer.querySelectorAll('input, select').forEach(el => {
                el.addEventListener('change', () => {
                    const id = el.dataset.id;
                    currentTableOptions[format][id] = el.type === 'checkbox' ? el.checked : el.value;
                    refreshTablePreview();
                });
            });
        }

        // --- 事件绑定 ---
        let sourceTimer;
        sourceInputEditor?.addEventListener('input', (e) => {
            clearTimeout(sourceTimer);
            sourceTimer = setTimeout(() => {
                if(e.target.value) parseAndUpdateGrid(e.target.value);
            }, 500);
        });

        sourceDataFormatSelect?.addEventListener('change', () => {
            if(sourceInputEditor && sourceInputEditor.value) parseAndUpdateGrid(sourceInputEditor.value);
        });

        document.getElementById('btn-undo-f')?.addEventListener('click', () => { if (tableDataset.undo()) syncTableAll(); });
        document.getElementById('btn-redo-f')?.addEventListener('click', () => { if (tableDataset.redo()) syncTableAll(); });
        document.getElementById('btn-transpose-f')?.addEventListener('click', () => { tableDataset.transpose(); syncTableAll(); });
        document.getElementById('btn-clear-f')?.addEventListener('click', () => {
            tableDataset.saveToHistory();
            tableDataset.headers = ['A', 'B', 'C'];
            tableDataset.rows = [['', '', ''], ['', '', '']];
            syncTableAll();
        });
        document.getElementById('btn-rm-blank-rows')?.addEventListener('click', () => {
            tableDataset.saveToHistory();
            tableDataset.rows = tableDataset.rows.filter(row => row.some(cell => cell && String(cell).trim() !== ''));
            syncTableAll();
        });
        document.getElementById('btn-upper-f')?.addEventListener('click', () => {
            tableDataset.saveToHistory();
            tableDataset.rows = tableDataset.rows.map(r => r.map(c => String(c).toUpperCase()));
            syncTableAll();
        });
        document.getElementById('btn-lower-f')?.addEventListener('click', () => {
            tableDataset.saveToHistory();
            tableDataset.rows = tableDataset.rows.map(r => r.map(c => String(c).toLowerCase()));
            syncTableAll();
        });

        tableFormatTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tableFormatTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentTableFormat = tab.dataset.format;
                renderTableConfig(currentTableFormat);
                refreshTablePreview();
            });
        });

        document.getElementById('btn-demo-data')?.addEventListener('click', () => {
            const demoJson = JSON.stringify([{ "id": 1, "name": "Apple" }, { "id": 2, "name": "Banana" }], null, 2);
            if (sourceDataFormatSelect) sourceDataFormatSelect.value = 'json';
            if (sourceInputEditor) { sourceInputEditor.value = demoJson; parseAndUpdateGrid(demoJson); }
        });

        document.getElementById('btn-copy-table')?.addEventListener('click', async () => {
            if (tableInput.value) {
                const success = await window.copyToClipboard(tableInput.value);
                if (success) {
                    const btn = document.getElementById('btn-copy-table');
                    const oldText = btn.textContent;
                    btn.textContent = '已拷贝!';
                    setTimeout(() => btn.textContent = oldText, 2000);
                }
            }
        });

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

        document.getElementById('btn-export-f')?.addEventListener('click', async () => {
            const format = currentTableFormat;
            const savePath = await ipcRenderer.invoke('show-save-dialog', { defaultPath: `export.${format}` });
            if (!savePath.filePath) return;
            try {
                let content = tableInput.value;
                if (content) { fs.writeFileSync(savePath.filePath, content); alert('导出成功！'); }
            } catch (e) { alert('导出失败: ' + e.message); }
        });

        document.getElementById('btn-import-f')?.addEventListener('click', async () => {
            const res = await ipcRenderer.invoke('show-open-dialog', {
                properties: ['openFile'],
                filters: [
                    { name: 'Table Files', extensions: ['csv', 'xlsx', 'xls', 'json', 'md', 'html', 'xml', 'yaml', 'txt'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });
            if (res && res.filePaths && res.filePaths.length > 0) {
                const filePath = res.filePaths[0];
                const ext = filePath.split('.').pop().toLowerCase();
                try {
                    if (ext === 'xlsx' || ext === 'xls') {
                        const buffer = fs.readFileSync(filePath);
                        const ds = await ExcelConverter.import(buffer, { sheetName: '' });
                        if (ds && ds.rows.length > 0) {
                            tableDataset.headers = ds.headers;
                            tableDataset.rows = ds.rows;
                            tableDataset.updateMetadata();
                            tableDataset.saveToHistory();
                            if (sourceDataFormatSelect) sourceDataFormatSelect.value = 'xlsx';
                            if (sourceInputEditor) sourceInputEditor.value = '/* Excel 二进制内容已被加载到内存中 */';
                            syncTableAll();
                        }
                    } else {
                        const text = fs.readFileSync(filePath, 'utf-8');
                        if (sourceInputEditor) sourceInputEditor.value = text;
                        if (ext === 'csv') sourceDataFormatSelect.value = 'csv';
                        else if (ext === 'json') sourceDataFormatSelect.value = 'json';
                        else if (ext === 'md') sourceDataFormatSelect.value = 'md';
                        else if (ext === 'html') sourceDataFormatSelect.value = 'html';
                        else if (ext === 'xml') sourceDataFormatSelect.value = 'xml';
                        else if (ext === 'yaml' || ext === 'yml') sourceDataFormatSelect.value = 'yaml';
                        parseAndUpdateGrid(text);
                    }
                } catch (err) {
                    alert('读取文件失败: ' + err.message);
                }
            }
        });

        // 初始化
        renderTableConfig(currentTableFormat);
        syncTableAll();
    }
};
