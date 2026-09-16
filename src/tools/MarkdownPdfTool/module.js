const { ipcRenderer } = require('electron');
const fs = require('fs');
const { marked } = require('marked');

// 配置 marked: 启用 GitHub Flavored Markdown 与换行转换
marked.setOptions({ gfm: true, breaks: true });

/**
 * 生成 Markdown 渲染所需的 CSS 样式
 * 同时用于预览面板与最终 PDF, 保证所见即所得
 * @param {string} theme light | sepia | dark
 */
function getMarkdownCSS(theme) {
    const themes = {
        light: {
            bg: '#ffffff',
            fg: '#1f2328',
            heading: '#1f2328',
            border: '#d0d7de',
            codeBg: '#f6f8fa',
            codeFg: '#1f2328',
            quote: '#57606a',
            quoteBorder: '#d0d7de',
            link: '#0969da',
            tableHead: '#f6f8fa',
            tableStripe: '#f6f8fa'
        },
        sepia: {
            bg: '#f8f1e3',
            fg: '#3c3326',
            heading: '#3c3326',
            border: '#d9c9a8',
            codeBg: '#efe6d0',
            codeFg: '#3c3326',
            quote: '#6b5d45',
            quoteBorder: '#d9c9a8',
            link: '#8a5a2b',
            tableHead: '#efe6d0',
            tableStripe: '#efe6d0'
        },
        dark: {
            bg: '#0d1117',
            fg: '#c9d1d9',
            heading: '#f0f6fc',
            border: '#30363d',
            codeBg: '#161b22',
            codeFg: '#c9d1d9',
            quote: '#8b949e',
            quoteBorder: '#30363d',
            link: '#58a6ff',
            tableHead: '#161b22',
            tableStripe: '#161b22'
        }
    };
    const c = themes[theme] || themes.light;

    return `
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
            background: ${c.bg};
            color: ${c.fg};
            line-height: 1.7;
            margin: 0;
            padding: 8px 4px;
            font-size: 14px;
            word-wrap: break-word;
        }
        h1, h2, h3, h4, h5, h6 { color: ${c.heading}; margin: 24px 0 16px; font-weight: 600; line-height: 1.25; }
        h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid ${c.border}; }
        h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid ${c.border}; }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1em; }
        h5 { font-size: 0.875em; }
        h6 { font-size: 0.85em; color: ${c.quote}; }
        p { margin: 0 0 16px; }
        a { color: ${c.link}; text-decoration: none; }
        a:hover { text-decoration: underline; }
        img { max-width: 100%; height: auto; }
        blockquote { padding: 0 1em; color: ${c.quote}; border-left: 0.25em solid ${c.quoteBorder}; margin: 0 0 16px; }
        ul, ol { padding-left: 2em; margin: 0 0 16px; }
        li + li { margin-top: 0.25em; }
        code {
            font-family: 'SF Mono', 'Menlo', Consolas, 'Liberation Mono', monospace;
            background: ${c.codeBg};
            color: ${c.codeFg};
            padding: 0.2em 0.4em;
            border-radius: 6px;
            font-size: 85%;
        }
        pre {
            background: ${c.codeBg};
            color: ${c.codeFg};
            padding: 16px;
            border-radius: 8px;
            overflow: auto;
            margin: 0 0 16px;
            line-height: 1.45;
        }
        pre code { background: transparent; padding: 0; font-size: 100%; }
        table {
            border-collapse: collapse;
            display: block;
            width: 100%;
            overflow: auto;
            margin: 0 0 16px;
        }
        th, td { padding: 6px 13px; border: 1px solid ${c.border}; }
        th { background: ${c.tableHead}; font-weight: 600; }
        tr:nth-child(2n) { background: ${c.tableStripe}; }
        hr { height: 1px; border: 0; border-top: 1px solid ${c.border}; margin: 24px 0; }
        input[type="checkbox"] { margin-right: 0.5em; }
    `;
}

module.exports = {
    init: function() {
        const input = document.getElementById('md-pdf-input');
        const preview = document.getElementById('md-pdf-preview');
        const stats = document.getElementById('md-pdf-stats');
        const status = document.getElementById('md-pdf-status');
        const pageSizeSel = document.getElementById('md-pdf-pagesize');
        const themeSel = document.getElementById('md-pdf-theme');

        // 实时预览 (防抖 250ms)
        let previewTimer;
        function renderPreview() {
            const md = input.value;
            if (!md.trim()) {
                preview.innerHTML = '<div class="empty-state" style="color:var(--text-dim);">输入 Markdown 后将在此显示预览</div>';
                return;
            }
            try {
                const html = marked.parse(md);
                preview.innerHTML = html;
            } catch (e) {
                preview.innerHTML = `<div style="color:var(--danger);">解析错误: ${e.message}</div>`;
            }
        }

        function updateStats() {
            const val = input.value;
            const lines = val ? val.split('\n').length : 0;
            stats.textContent = `${lines} 行 / ${val.length} 字符`;
        }

        input?.addEventListener('input', () => {
            clearTimeout(previewTimer);
            previewTimer = setTimeout(() => { renderPreview(); updateStats(); }, 250);
        });

        // 主题切换时重新注入预览样式
        let styleEl = document.createElement('style');
        document.head.appendChild(styleEl);
        function applyPreviewTheme() {
            // 预览容器使用独立的 scoped 样式, 仅作用于 .md-pdf-preview
            const theme = themeSel.value;
            const css = getMarkdownCSS(theme)
                .replace(/body\s*\{/g, '.md-pdf-preview {')
                .replace(/body,/g, '.md-pdf-preview,');
            styleEl.textContent = css;
        }
        themeSel?.addEventListener('change', applyPreviewTheme);

        // 导入 .md 文件
        document.getElementById('md-pdf-import')?.addEventListener('click', async () => {
            const res = await window.electron.showOpenDialog({
                properties: ['openFile'],
                filters: [
                    { name: 'Markdown Files', extensions: ['md', 'markdown', 'txt'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });
            if (!res || !res.filePaths || res.filePaths.length === 0) return;
            try {
                const text = fs.readFileSync(res.filePaths[0], 'utf-8');
                input.value = text;
                renderPreview();
                updateStats();
                status.textContent = '已载入: ' + res.filePaths[0].split('/').pop();
            } catch (err) {
                alert('读取文件失败: ' + err.message);
            }
        });

        // 清空
        document.getElementById('md-pdf-clear')?.addEventListener('click', () => {
            input.value = '';
            renderPreview();
            updateStats();
            status.textContent = '已清空';
        });

        // 转 PDF
        document.getElementById('md-pdf-convert')?.addEventListener('click', async () => {
            const md = input.value.trim();
            if (!md) { alert('请先输入 Markdown 内容'); return; }

            const btn = document.getElementById('md-pdf-convert');
            const originalText = btn.textContent;
            btn.textContent = '生成中...';
            btn.disabled = true;
            status.textContent = '正在生成 PDF, 请稍候...';

            try {
                const theme = themeSel.value;
                const pageSize = pageSizeSel.value;
                const htmlBody = marked.parse(md);
                const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>${getMarkdownCSS(theme)}</style>
</head>
<body>${htmlBody}</body>
</html>`;

                const pdfData = await ipcRenderer.invoke('md-to-pdf', fullHtml, { pageSize });
                if (!pdfData) throw new Error('PDF 生成返回空数据');

                const saveRes = await window.electron.showSaveDialog({
                    defaultPath: 'markdown-export.pdf',
                    filters: [{ name: 'PDF Files', extensions: ['pdf'] }, { name: 'All Files', extensions: ['*'] }]
                });
                if (!saveRes || !saveRes.filePath) { status.textContent = '已取消保存'; return; }

                fs.writeFileSync(saveRes.filePath, Buffer.from(pdfData));
                status.textContent = '导出成功: ' + saveRes.filePath.split('/').pop();
                alert('PDF 导出成功！');
            } catch (err) {
                console.error('MD to PDF error:', err);
                alert('PDF 生成失败: ' + err.message);
                status.textContent = '失败: ' + err.message;
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });

        // 初始化
        applyPreviewTheme();
        renderPreview();
        updateStats();

        // 清理: 移除动态注入的 style 节点
        window.onToolUnload = () => {
            clearTimeout(previewTimer);
            if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        };
    }
};
