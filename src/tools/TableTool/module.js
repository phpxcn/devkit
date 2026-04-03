const TableDataset = require('../../models/TableDataset');
const { CSVConverter, ExcelConverter } = require('../../converters/TableConverters');
const MarkdownConverter = require('../../converters/MarkdownConverter');
const { SQLConverter, HTMLConverter, JSONConverter, XMLConverter, YAMLConverter, ASCIIConverter } = require('../../converters/MoreConverters');
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
                    const { JSONConverter, HTMLConverter, XMLConverter, YAMLConverter } = require('./src/converters/MoreConverters');
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
        const TableConfigSchemas = {
            json: [
                { id: 'compact', type: 'checkbox', label: '压缩输出', default: false },
                { id: 'indent', type: 'select', label: '缩进大小', options: ['2 spaces', '4 spaces', 'Tabs'], default: '2 spaces' }
            ],
            csv: [
                { id: 'quoteAll', type: 'checkbox', label: '双引号包装', default: false },
                { id: 'delimiter', type: 'select', label: '值分隔符', options: [
                    { label: 'Comma (,)', value: ',' }, { label: 'Tab (\\t)', value: '\t' }, { label: 'Semicolon (;)', value: ';' }
                ], default: ',' }
            ]
            // ... 其他配置项可以根据需要从原 renderer.js 移过来
        };

        function renderTableConfig(format) {
            if (!tableConfigContainer) return;
            const schema = TableConfigSchemas[format] || [];
            if (!currentTableOptions[format]) {
                currentTableOptions[format] = {};
                schema.forEach(item => currentTableOptions[format][item.id] = item.default);
            }

            let html = '<div class="config-wrapper">';
            schema.forEach(item => {
                if (item.type === 'checkbox') {
                    html += `
                        <label class="f-checkbox-label">
                            <input type="checkbox" data-id="${item.id}" ${currentTableOptions[format][item.id] ? 'checked' : ''}>
                            <div class="checkbox-box"></div>
                            <span class="checkbox-text">${item.label}</span>
                        </label>`;
                } else if (item.type === 'select') {
                    html += `
                        <div class="grid-item">
                            <span class="item-label-row">${item.label}</span>
                            <select class="f-select-modern" data-id="${item.id}">
                                ${item.options.map(opt => {
                                    const val = typeof opt === 'object' ? opt.value : opt;
                                    const lab = typeof opt === 'object' ? opt.label : opt;
                                    return `<option value="${val}" ${currentTableOptions[format][item.id] == val ? 'selected' : ''}>${lab}</option>`;
                                }).join('')}
                            </select>
                        </div>`;
                }
            });
            html += '</div>';
            tableConfigContainer.innerHTML = html;

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

        document.getElementById('btn-export-f')?.addEventListener('click', async () => {
            const format = currentTableFormat;
            const savePath = await ipcRenderer.invoke('show-save-dialog', { defaultPath: `export.${format}` });
            if (!savePath.filePath) return;
            try {
                let content = tableInput.value;
                if (content) { fs.writeFileSync(savePath.filePath, content); alert('导出成功！'); }
            } catch (e) { alert('导出失败: ' + e.message); }
        });

        // 初始化
        renderTableConfig(currentTableFormat);
    }
};
