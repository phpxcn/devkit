const JsonTool = require('../JsonTool');
const fs = require('fs');
const path = require('path');

// 注入外部依赖文件 (保障 CodeMirror, jsonlint 等依赖挂载到 window/全局)
function loadScriptSync(filePath) {
    const code = fs.readFileSync(path.join(__dirname, filePath), 'utf-8');
    const script = document.createElement('script');
    script.text = code;
    document.head.appendChild(script);
}

// 采用同步加载方式，确保这些由于原来是 web 环境的代码跑在当前环境
if (!document.getElementById('cm-json-styles')) {
    const css = fs.readFileSync(path.join(__dirname, 'libs/indexCodeMirror.min.css'), 'utf-8');
    const style = document.createElement('style');
    style.id = 'cm-json-styles';
    // 强制编辑器宽高与搜索框样式
    style.innerHTML = css + `
.CodeMirror { width: 100%; height: 100%; font-family: "JetBrains Mono", Consolas, monospace; font-size: 14px; position: absolute; top:0; left:0; bottom:0; right:0;}
.json-search-container { display: flex; flex-direction: column; background: var(--bg-card); border-radius: 6px; padding: 2px 4px; border: 1px solid var(--border-color); transition: var(--transition); margin: 0 10px; min-width: 220px; }
.search-main { display: flex; flex-direction: column; width: 100%; }
.search-row, .replace-row { display: flex; align-items: center; justify-content: space-between; }
.search-row { border-bottom: none; }
.json-search-container:has(.replace-row:not([style*="display: none"])) .search-row { border-bottom: 1px solid var(--border-color); padding-bottom: 2px; margin-bottom: 2px; }
.json-search-container:hover { border-color: var(--text-dim); }
.json-search-container:focus-within { border-color: var(--accent-color); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 25%, transparent); }
.search-input-wrapper { display: flex; align-items: center; position: relative; flex: 1; }
#json-search-input, #json-replace-input { background: transparent; border: none; color: var(--text-primary); font-size: 12px; outline: none; padding: 4px 8px; width: 100%; min-width: 60px; }
.search-options { display: flex; align-items: center; gap: 2px; margin-right: 6px; flex-shrink: 0; }
.opt-btn { background: transparent; border: none; color: var(--text-dim); font-size: 10px; cursor: pointer; padding: 2px 4px; border-radius: 3px; font-family: var(--font-mono); transition: var(--transition); line-height: 1; }
.opt-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.05); }
.opt-btn.active { color: #fff; background: var(--accent-color); font-weight: bold; }
.search-count { color: var(--text-dim); font-size: 11px; margin-right: 4px; white-space: nowrap; min-width: 30px; text-align: center; flex-shrink: 0; }
.search-controls { display: flex; gap: 2px; border-left: 1px solid var(--border-color); padding-left: 4px; flex-shrink: 0; }
.search-btn { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px; border-radius: 4px; transition: var(--transition); }
.search-btn:hover { background: rgba(255, 255, 255, 0.05); color: var(--accent-color); }
.search-btn.active svg { transform: rotate(180deg); }
.search-btn svg { display: block; }
`;
    document.head.appendChild(style);
    
    // 直接把这三个依赖通过 script 注入，这样跟 bejson 环境完全一致
    loadScriptSync('libs/jsonlint.js');
    loadScriptSync('libs/indexCodeMirror.min.js');
    loadScriptSync('libs/lz-string-1.4.4.js');
}

module.exports = {
    init: function () {
        const jsonTool = new JsonTool();

        const jsonInput       = document.getElementById('json-input');
        const statusBadge     = document.getElementById('json-validate-badge');
        const statusInfo      = document.getElementById('json-info-text');
        const sizeInfo        = document.getElementById('json-size-info');

        const btnFormat    = document.getElementById('btn-format');
        const btnCompress  = document.getElementById('btn-compress');
        const btnEscape    = document.getElementById('btn-escape');
        const btnUnescape  = document.getElementById('btn-unescape');
        const btnUnicodeCn = document.getElementById('btn-unicode-cn');
        const btnCnUnicode = document.getElementById('btn-cn-unicode');
        const btnClear     = document.getElementById('btn-clear-json');
        const btnCopy      = document.getElementById('btn-copy-json');

        const searchInput  = document.getElementById('json-search-input');
        const replaceInput = document.getElementById('json-replace-input');
        const searchCount  = document.getElementById('search-count');
        const btnFindPrev  = document.getElementById('btn-find-prev');
        const btnFindNext  = document.getElementById('btn-find-next');
        const btnToggleReplace = document.getElementById('btn-toggle-replace');
        const btnReplaceOne    = document.getElementById('btn-replace-one');
        const btnReplaceAll    = document.getElementById('btn-replace-all');
        const replaceRow       = document.getElementById('replace-row');

        const btnOptCase  = document.getElementById('btn-opt-case');
        const btnOptWord  = document.getElementById('btn-opt-word');
        const btnOptRegex = document.getElementById('btn-opt-regex');

        let searchOpts = {
            matchCase: false,
            wholeWord: false,
            useRegex: false
        };

        // ── 工具函数 ─────────────────────────────────────────────
        function formatBytes(n) {
            if (n < 1024) return n + ' B';
            if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
            return (n / 1024 / 1024).toFixed(2) + ' MB';
        }

        function setStatus(type, msg) {
            statusBadge.className = 'status-badge badge-' + type;
            statusBadge.textContent = type === 'ok' ? '✓ 合法' : type === 'error' ? '✗ 错误' : '';
            statusInfo.textContent = msg;
        }

        // ── 初始化 CodeMirror ─────────────────────────────────────
        const editor = window.CodeMirror.fromTextArea(jsonInput, {
            mode: "application/json",
            theme: "default",
            lineNumbers: true,
            lineWrapping: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
            lint: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            styleActiveLine: true
        });

        // ── 核心刷新 ─────────────────────────────────────────────
        function updateAll() {
            const val = editor.getValue();
            const bytes = val.length; 
            const lines = editor.lineCount();

            if (val.length === 0) {
                sizeInfo.textContent = '';
                setStatus('none', '请粘贴 JSON 数据');
                return;
            } 
            
            sizeInfo.textContent = `${lines.toLocaleString()} 行 · ${formatBytes(bytes)}`;

            if (val.trim()) {
                try {
                    window.jsonlint.parse(val);
                    setStatus('ok', 'JSON 格式合法');
                } catch (e) {
                    setStatus('error', e.message.split('\n')[0]);
                }
            } else {
                setStatus('none', '请粘贴 JSON 数据');
            }
        }

        let debounceTimer;
        editor.on('change', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateAll, 300);
        });

        // ── 格式化校验 ─────────────────────────────────────────────
        btnFormat.addEventListener('click', () => {
            const val = editor.getValue().trim();
            if (!val) return;
            try {
                // 利用原生解析进行格式化
                const obj = JSON.parse(val);
                editor.setValue(JSON.stringify(obj, null, 2));
                setStatus('ok', 'JSON 格式合法 · 已美化排版');
            } catch (e) {
                // 如果原生解析失败，交给 jsonlint 爆出具体错误
                try {
                    window.jsonlint.parse(val);
                } catch(lintErr) {
                    setStatus('error', lintErr.message || lintErr);
                }
            }
        });

        // ── 压缩 (Minify) ──────────────────────────────────────────────────
        btnCompress.addEventListener('click', () => {
            const val = editor.getValue().trim();
            if (!val) return;
            try {
                const obj = JSON.parse(val);
                editor.setValue(JSON.stringify(obj));
                setStatus('ok', '已压缩为单行');
            } catch (e) {
                try { window.jsonlint.parse(val); } catch(lintErr) {
                    setStatus('error', lintErr.message || lintErr);
                }
            }
        });

        // ── 转义（字符串内的特殊字符） ─────────────────────────────
        btnEscape.addEventListener('click', () => {
            const val = editor.getValue();
            if (!val) return;
            editor.setValue(JSON.stringify(val));
            updateAll();
        });

        // ── 去除转义 ───────────────────────────────────────────────
        btnUnescape.addEventListener('click', () => {
            const val = editor.getValue().trim();
            if (!val) return;
            try {
                const target = val.startsWith('"') ? val : `"${val}"`;
                editor.setValue(JSON.parse(target));
                updateAll();
            } catch (e) {
                setStatus('error', '去除转义失败: ' + e.message);
            }
        });

        // ── Unicode 转中文 ─────────────────────────────────────────
        btnUnicodeCn.addEventListener('click', () => {
            const val = editor.getValue();
            if (!val) return;
            editor.setValue(val.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
                String.fromCharCode(parseInt(code, 16))
            ));
            updateAll();
        });

        // ── 中文转 Unicode ─────────────────────────────────────────
        btnCnUnicode.addEventListener('click', () => {
            const val = editor.getValue();
            if (!val) return;
            editor.setValue(val.replace(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g, (ch) =>
                '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
            ));
            updateAll();
        });

        // ── 清空 ───────────────────────────────────────────────────
        btnClear.addEventListener('click', () => {
            editor.setValue('');
            editor.clearHistory();
            sizeInfo.textContent = '';
            setStatus('none', '请粘贴 JSON 数据');
        });

        // ── 复制 ───────────────────────────────────────────────────
        btnCopy.addEventListener('click', async () => {
            const val = editor.getValue();
            if (!val) return;
            const success = await window.copyToClipboard(val);
            if (success) {
                const orig = btnCopy.textContent;
                btnCopy.textContent = '✓ 已复制';
                setTimeout(() => (btnCopy.textContent = orig), 2000);
            }
        });

        // ── 查找功能实现 ──────────────────────────────────────────
        let searchResults = [];
        let currentSearchIndex = -1;

        function doSearch() {
            const query = searchInput.value;
            if (!query) {
                searchResults = [];
                currentSearchIndex = -1;
                searchCount.textContent = '0/0';
                return;
            }

            const content = editor.getValue();
            searchResults = [];
            
            try {
                let flags = 'g';
                if (!searchOpts.matchCase) flags += 'i';
                
                let pattern = query;
                if (!searchOpts.useRegex) {
                    // 转义正则特殊字符
                    pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                }
                
                if (searchOpts.wholeWord) {
                    pattern = `\\b${pattern}\\b`;
                }

                const regex = new RegExp(pattern, flags);
                let match;
                while ((match = regex.exec(content)) !== null) {
                    searchResults.push(match.index);
                    // 防止空匹配死循环
                    if (match.index === regex.lastIndex) regex.lastIndex++;
                }

                if (searchResults.length > 0) {
                    if (currentSearchIndex === -1 || currentSearchIndex >= searchResults.length) {
                        currentSearchIndex = 0;
                    }
                    updateSearchStats();
                    highlightCurrentMatch();
                } else {
                    currentSearchIndex = -1;
                    searchCount.textContent = '0/0';
                }
            } catch (e) {
                // 如果正则语法错误，保持安静不崩溃
                console.error('Search error:', e);
                searchCount.textContent = 'Err';
            }
        }

        function updateSearchStats() {
            searchCount.textContent = `${currentSearchIndex + 1}/${searchResults.length}`;
        }

        function highlightCurrentMatch() {
            if (currentSearchIndex === -1) return;
            
            const startPos = searchResults[currentSearchIndex];
            const endPos = startPos + searchInput.value.length;
            
            // 将索引转换为 CodeMirror 坐标 {line, ch}
            const startCM = editor.posFromIndex(startPos);
            const endCM = editor.posFromIndex(endPos);
            
            editor.setSelection(startCM, endCM);
            editor.scrollIntoView({from: startCM, to: endCM}, 100);
        }

        searchInput.addEventListener('input', () => {
            currentSearchIndex = 0;
            doSearch();
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    btnFindPrev.click();
                } else {
                    btnFindNext.click();
                }
            }
        });

        btnFindNext.addEventListener('click', () => {
            if (searchResults.length === 0) return;
            currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
            updateSearchStats();
            highlightCurrentMatch();
        });

        btnFindPrev.addEventListener('click', () => {
            if (searchResults.length === 0) return;
            currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
            updateSearchStats();
            highlightCurrentMatch();
        });

        // ── 替换功能实现 ──────────────────────────────────────────
        btnToggleReplace.addEventListener('click', () => {
            const isHidden = replaceRow.style.display === 'none';
            replaceRow.style.display = isHidden ? 'flex' : 'none';
            btnToggleReplace.classList.toggle('active', !isHidden);
        });

        btnReplaceOne.addEventListener('click', () => {
            const query = searchInput.value;
            const replacement = replaceInput.value;
            if (!query || currentSearchIndex === -1) return;

            const startPos = searchResults[currentSearchIndex];
            const startCM = editor.posFromIndex(startPos);
            const endCM = editor.posFromIndex(startPos + query.length);

            // 替换当前选中的内容
            editor.replaceRange(replacement, startCM, endCM);
            
            // 重新搜索以更新索引
            doSearch();
        });

        btnReplaceAll.addEventListener('click', () => {
            const query = searchInput.value;
            const replacement = replaceInput.value;
            if (!query) return;

            const content = editor.getValue();
            // 使用正则全局替换（注意转义特殊字符）
            const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const newContent = content.replace(new RegExp(escapedQuery, 'g'), replacement);
            
            if (content !== newContent) {
                const scrollInfo = editor.getScrollInfo();
                editor.setValue(newContent);
                editor.scrollTo(scrollInfo.left, scrollInfo.top);
                doSearch();
            }
        });

        // ── 选项功能绑定 ──────────────────────────────────────────
        [
            { btn: btnOptCase, key: 'matchCase' },
            { btn: btnOptWord, key: 'wholeWord' },
            { btn: btnOptRegex, key: 'useRegex' }
        ].forEach(opt => {
            opt.btn.addEventListener('click', () => {
                searchOpts[opt.key] = !searchOpts[opt.key];
                opt.btn.classList.toggle('active', searchOpts[opt.key]);
                doSearch();
            });
        });

        // 快捷键支持: Ctrl+F 聚焦搜索框
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        });

        // 首次加载后刷新一下状态
        setTimeout(updateAll, 100);
    }
};
