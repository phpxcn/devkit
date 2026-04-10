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
    // 强制编辑器宽高
    style.innerHTML = css + '\n.CodeMirror { width: 100%; height: 100%; font-family: "JetBrains Mono", Consolas, monospace; font-size: 14px; position: absolute; top:0; left:0; bottom:0; right:0;}';
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

        // 首次加载后刷新一下状态
        setTimeout(updateAll, 100);
    }
};
