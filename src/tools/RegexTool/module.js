module.exports = {
    init: function () {
        const patternInput    = document.getElementById('regex-pattern');
        const testText        = document.getElementById('test-text');
        const matchHighlight  = document.getElementById('match-highlight');
        const captureGroups   = document.getElementById('capture-groups');
        const matchCount      = document.getElementById('match-count');
        const statusBadge     = document.getElementById('regex-status-badge');
        const btnExec         = document.getElementById('btn-exec-regex');
        const btnClear        = document.getElementById('btn-clear-regex');
        const flagBtns        = document.querySelectorAll('.regex-flags .opt-btn');

        const EMPTY_HINT = '<span style="color: var(--text-dim);">输入正则与文本后将在此显示高亮结果</span>';

        // ── 工具函数 ────────────────────────────────────────────
        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // 从 toggle 按钮的 active 状态拼接 flags（默认 g 处于 active）
        function getFlags() {
            let f = '';
            flagBtns.forEach(b => {
                if (b.classList.contains('active')) f += b.dataset.flag;
            });
            return f;
        }

        function setStatus(type, msg) {
            if (!statusBadge) return;
            statusBadge.className = 'status-badge' + (type ? ' badge-' + type : '');
            statusBadge.textContent = msg || '';
        }

        // 拿所有匹配：global 时用 matchAll，非 global 时 exec 一次
        function getAllMatches(regex, text) {
            const matches = [];
            if (regex.global) {
                try {
                    for (const m of text.matchAll(regex)) matches.push(m);
                } catch (e) {
                    // 兜底：exec 循环 + 空匹配守卫
                    let m, guard = 0;
                    while ((m = regex.exec(text)) !== null && guard++ < 100000) {
                        matches.push(m);
                        if (m.index === regex.lastIndex) regex.lastIndex++;
                    }
                }
            } else {
                const m = regex.exec(text);
                if (m) matches.push(m);
            }
            return matches;
        }

        // 高亮 HTML：先对每段原文 escapeHtml，再包 <mark>，避免索引偏移与 XSS
        function buildHighlightHtml(text, matches) {
            let html = '';
            let cursor = 0;
            matches.forEach(m => {
                const start = m.index;
                const end = start + m[0].length;
                if (start > cursor) html += escapeHtml(text.slice(cursor, start));
                html += '<mark>' + escapeHtml(m[0]) + '</mark>';
                cursor = end;
            });
            if (cursor < text.length) html += escapeHtml(text.slice(cursor));
            return html;
        }

        // 捕获组渲染：每个 match 展开 group 0 / 1 / 2 ...
        function renderCaptureGroups(matches) {
            captureGroups.innerHTML = '';
            if (matches.length === 0) {
                captureGroups.innerHTML = '<div class="empty-state">无匹配结果</div>';
                return;
            }
            matches.forEach((m, i) => {
                const rows = [];
                for (let g = 0; g < m.length; g++) {
                    const v = m[g];
                    let display, isEmpty = false;
                    if (v === undefined) { display = '(undefined)'; isEmpty = true; }
                    else if (v === '') { display = '(empty)'; isEmpty = true; }
                    else display = escapeHtml(v);
                    rows.push(
                        `<tr><td class="grp">group ${g}</td>` +
                        `<td class="val${isEmpty ? ' empty' : ''}">${display}</td></tr>`
                    );
                }
                const item = document.createElement('div');
                item.className = 'capture-item';
                item.innerHTML =
                    `<div class="capture-item-head">` +
                        `<span><span class="idx">#${i + 1}</span>位置 ${m.index}</span>` +
                        `<span>${m[0].length} 字符</span>` +
                    `</div>` +
                    `<table class="capture-table"><tbody>${rows.join('')}</tbody></table>`;
                captureGroups.appendChild(item);
            });
        }

        // ── 主执行 ──────────────────────────────────────────────
        function execute() {
            const pattern = patternInput.value;
            const text = testText.value;

            // 空输入：回到初始态
            if (!pattern || !text) {
                matchHighlight.innerHTML = EMPTY_HINT;
                matchCount.textContent = '匹配 0 处';
                renderCaptureGroups([]);
                setStatus('', '');
                return;
            }

            const flags = getFlags();
            let regex;
            try {
                regex = new RegExp(pattern, flags);
            } catch (e) {
                matchHighlight.innerHTML =
                    '<span class="regex-error">⚠ 正则语法错误: ' + escapeHtml(e.message) + '</span>';
                matchCount.textContent = '匹配 0 处';
                renderCaptureGroups([]);
                setStatus('error', '语法错误');
                return;
            }

            const matches = getAllMatches(regex, text);
            matchCount.textContent = `匹配 ${matches.length} 处`;

            if (matches.length === 0) {
                matchHighlight.innerHTML = '<span style="color: var(--text-dim);">无匹配项</span>';
            } else {
                matchHighlight.innerHTML = buildHighlightHtml(text, matches);
            }
            renderCaptureGroups(matches);
            setStatus(matches.length ? 'ok' : '', matches.length ? `命中 ${matches.length}` : '无匹配');
        }

        // ── debounce 200ms（pattern / flags / test-text 任一变化都触发） ──
        let timer;
        function schedule() {
            clearTimeout(timer);
            timer = setTimeout(execute, 200);
        }

        // ── 事件绑定 ────────────────────────────────────────────
        patternInput.addEventListener('input', schedule);
        testText.addEventListener('input', schedule);

        flagBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                schedule();
            });
        });

        btnExec?.addEventListener('click', () => {
            clearTimeout(timer);
            execute();
        });

        btnClear?.addEventListener('click', () => {
            patternInput.value = '';
            testText.value = '';
            matchHighlight.innerHTML = EMPTY_HINT;
            matchCount.textContent = '匹配 0 处';
            renderCaptureGroups([]);
            setStatus('', '');
            // 修饰词重置为默认 g
            flagBtns.forEach(b => b.classList.toggle('active', b.dataset.flag === 'g'));
        });

        // 首次进入执行一次（展示初始态）
        execute();
    }
};
