const JsonTool = require('../JsonTool');
const JSONTreeView = require('../../ui/JSONTreeView');

module.exports = {
    init: function() {
        const jsonTool = new JsonTool();
        const unifiedEditor = document.getElementById('unified-json-editor');
        const jsonTreeView = new JSONTreeView(unifiedEditor);
        const jsonInput = document.getElementById('json-input');
        const jsonInputH = document.getElementById('json-input-h');
        
        const btnFormat = document.getElementById('btn-format');
        const btnCompress = document.getElementById('btn-compress');
        const btnClearJson = document.getElementById('btn-clear-json');
        const btnCopyJson = document.getElementById('btn-copy-json');

        // 语法高亮引擎
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

        // 自动滚动同步
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

        btnCopyJson.addEventListener('click', async () => {
            if (jsonInput.value) {
                const success = await window.copyToClipboard(jsonInput.value);
                if (success) {
                    const originalText = btnCopyJson.textContent;
                    btnCopyJson.textContent = '已复制!';
                    setTimeout(() => btnCopyJson.textContent = originalText, 2000);
                }
            }
        });
    }
};
