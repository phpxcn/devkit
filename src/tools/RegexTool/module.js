module.exports = {
    init: function () {
        // ══════════════════════ 公共 DOM ══════════════════════
        const tabBtns          = document.querySelectorAll('.regex-tabs .btn-tab');
        const panels           = document.querySelectorAll('.regex-panel');

        // ══════════════════════ 测试页 ══════════════════════
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

        // ══════════════════════ 构造助手 ══════════════════════
        const builderPattern   = document.getElementById('builder-pattern');
        const builderFlagsText = document.getElementById('builder-flags-text');
        const builderFlagBtns  = document.querySelectorAll('.regex-flags-small .opt-btn');
        const btnBuilderClear  = document.getElementById('builder-clear');
        const btnBuilderCopy   = document.getElementById('builder-copy');
        const btnToTester      = document.getElementById('builder-to-tester');
        const chipBtns         = document.querySelectorAll('.chip-btn');
        const templateCards    = document.querySelectorAll('.template-card');

        // ── Tab 切换 ────────────────────────────────────────────
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                panels.forEach(p => {
                    p.style.display = (p.dataset.panel === target) ? '' : 'none';
                });
            });
        });

        // ── 公共工具函数 ─────────────────────────────────────────
        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getFlagsFrom(btnSet) {
            let f = '';
            btnSet.forEach(b => { if (b.classList.contains('active')) f += b.dataset.flag || b.dataset.flagSmall || ''; });
            return f;
        }

        function setStatus(type, msg) {
            if (!statusBadge) return;
            statusBadge.className = 'status-badge' + (type ? ' badge-' + type : '');
            statusBadge.textContent = msg || '';
        }

        function getAllMatches(regex, text) {
            const matches = [];
            if (regex.global) {
                try {
                    for (const m of text.matchAll(regex)) matches.push(m);
                } catch (e) {
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

        // ── 主执行（测试页） ────────────────────────────────────────
        function execute() {
            const pattern = patternInput.value;
            const text = testText.value;

            if (!pattern || !text) {
                matchHighlight.innerHTML = EMPTY_HINT;
                matchCount.textContent = '匹配 0 处';
                renderCaptureGroups([]);
                setStatus('', '');
                return;
            }

            const flags = getFlagsFrom(flagBtns);
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

        // debounce（测试页）
        let execTimer;
        function scheduleExecute() {
            clearTimeout(execTimer);
            execTimer = setTimeout(execute, 200);
        }

        // 测试页事件
        patternInput.addEventListener('input', scheduleExecute);
        testText.addEventListener('input', scheduleExecute);
        flagBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                scheduleExecute();
            });
        });
        btnExec?.addEventListener('click', () => { clearTimeout(execTimer); execute(); });
        btnClear?.addEventListener('click', () => {
            patternInput.value = '';
            testText.value = '';
            matchHighlight.innerHTML = EMPTY_HINT;
            matchCount.textContent = '匹配 0 处';
            renderCaptureGroups([]);
            setStatus('', '');
            flagBtns.forEach(b => b.classList.toggle('active', b.dataset.flag === 'g'));
        });

        execute();

        // ═════════════════════════════════════════════════════════════
        // ══════════════════════ 构造助手逻辑 ══════════════════════
        // ═════════════════════════════════════════════════════════════

        // ── 修饰词同步显示 ────────────────────────────────────────────
        function syncBuilderFlagsText() {
            builderFlagsText.textContent = getFlagsFrom(builderFlagBtns);
        }
        builderFlagBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                syncBuilderFlagsText();
            });
        });
        syncBuilderFlagsText();

        // ── 清空/复制 ────────────────────────────────────────────────
        btnBuilderClear?.addEventListener('click', () => {
            builderPattern.value = '';
            builderFlagBtns.forEach(b => b.classList.toggle('active', (b.dataset.flagSmall || '') === 'g'));
            syncBuilderFlagsText();
            builderPattern.focus();
        });

        btnBuilderCopy?.addEventListener('click', () => {
            const flags = getFlagsFrom(builderFlagBtns);
            const s = '/' + builderPattern.value + '/' + flags;
            (navigator.clipboard && navigator.clipboard.writeText(s))
                .then(() => {
                    const old = btnBuilderCopy.textContent;
                    btnBuilderCopy.textContent = '✓ 已复制';
                    setTimeout(() => { btnBuilderCopy.textContent = old; }, 900);
                })
                .catch(() => {
                    // 兜底：document.execCommand（electron 沙箱可能无 navigator.clipboard 权限）
                    const ta = document.createElement('textarea');
                    ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
                    document.body.appendChild(ta); ta.select();
                    try { document.execCommand('copy'); } catch (_) {}
                    document.body.removeChild(ta);
                });
        });

        // ── 工具：在输入框光标处插入文本；带 data-sel 的会反选 ... 部分 ───
        function insertAtCursor(input, snippet, selectBack) {
            const start = input.selectionStart || 0;
            const end   = input.selectionEnd   || 0;
            const before = input.value.slice(0, start);
            const after  = input.value.slice(end);
            const newValue = before + snippet + after;
            input.value = newValue;

            let caret;
            if (typeof selectBack === 'number' && selectBack > 0 && selectBack <= snippet.length) {
                // 选中最后 selectBack 个字符（通常是括号里的 "..."）
                caret = start + snippet.length;
                input.setSelectionRange(caret - selectBack, caret);
            } else {
                caret = start + snippet.length;
                input.setSelectionRange(caret, caret);
            }
            input.focus();
            // 触发 input 事件（如果测试页将来复用这个输入框）
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // ── 构造块 chip 按钮点击 ────────────────────────────────────
        chipBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.dataset.insertRaw;
                const use = typeof raw === 'string' ? raw : btn.dataset.insert;
                const suffix = btn.dataset.suffix || '';
                const selectBack = parseInt(btn.dataset.sel || '0', 10);

                // data-insert 是展示给用户看的 (含 html 反斜杠转义)
                // data-insert-raw 是要真正写到输入框里的（已经是 JS 字符串字面量，反斜杠数正确）
                const snippet = use + suffix;
                insertAtCursor(builderPattern, snippet, selectBack);
            });
        });

        // ── 模板卡片：一键填入表达式 + 样例文本 ───────────────────────
        const TEMPLATES = {
            'cn-phone': {
                pattern: '1[3-9]\\d{9}',
                flags:   'g',
                text:    '联系方式：13812345678，备用号 15900001111，固定电话 021-88889999，假号 12300000000'
            },
            'cn-id': {
                pattern: '\\d{17}[\\dXx]',
                flags:   'g',
                text:    '居民身份证 310101199001011234，另一个 11010120001231003X，学生号 SZ20210001'
            },
            'email': {
                pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+',
                flags:   'gi',
                text:    'Email: alice@example.com,  Bob+tag@foo-bar.co.uk,  not_an_email,  x@y.z'
            },
            'url': {
                pattern: 'https?:\\/\\/[\\w.-]+(?:\\/\\S*)?',
                flags:   'gi',
                text:    '请访问 https://www.example.com/path?q=1 或 http://foo.bar，不要 ftp:// 开头的。'
            },
            'ipv4': {
                pattern: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
                flags:   'g',
                text:    '机器 IP 列表：192.168.1.1，网关 10.0.0.254，公网 8.8.8.8，伪 999.1.1.1'
            },
            'decimal': {
                pattern: '\\d+(\\.\\d{1,2})?',
                flags:   'g',
                text:    '价格 199.99 元，运费 8 元，合计 207.99，百分比 12.5%，整数 300'
            },
            'date-cn': {
                pattern: '\\d{4}-\\d{2}-\\d{2}',
                flags:   'g',
                text:    '起始日期 2024-05-13，结束 2024-06-30，签约 2023/12/01（格式不同）'
            },
            'time-cn': {
                pattern: '\\d{2}:\\d{2}(:\\d{2})?',
                flags:   'g',
                text:    '预约时间 09:30，截止 18:00:00，凌晨 00:01，中午 12:30:05'
            },
            'hex-color': {
                pattern: '#[0-9A-Fa-f]{3,8}',
                flags:   'g',
                text:    '主题色 #6366f1，强调 #eab308，背景 #fff，#1f2937cc（含 alpha）'
            },
            'cn-name': {
                pattern: '[\\u4e00-\\u9fa5]{2,4}',
                flags:   'g',
                text:    '张三、李四、欧阳克、张三丰、Tom 史密斯（这里只匹配中文）'
            }
        };

        templateCards.forEach(card => {
            card.addEventListener('click', () => {
                const tpl = TEMPLATES[card.dataset.tpl];
                if (!tpl) return;
                builderPattern.value = tpl.pattern;
                // 同步 flags（仅这 4 个存在于 builder）
                builderFlagBtns.forEach(b => {
                    const f = b.dataset.flagSmall || '';
                    b.classList.toggle('active', tpl.flags.indexOf(f) >= 0);
                });
                syncBuilderFlagsText();
                // 同步把测试文本塞到测试页的 test-text（切过去立即能看到结果）
                if (testText) testText.value = tpl.text;
                execute();
                // 提示：模板已载入，用户下一步点"去测试"
                const old = btnToTester.textContent;
                btnToTester.textContent = '✓ 已载入 → 去测试';
                setTimeout(() => { btnToTester.textContent = old; }, 1100);
            });
        });

        // ── 「→ 去测试」按钮：把表达式同步到测试页并切换 tab ───────
        btnToTester?.addEventListener('click', () => {
            patternInput.value = builderPattern.value;
            const flags = getFlagsFrom(builderFlagBtns);
            flagBtns.forEach(b => {
                b.classList.toggle('active', flags.indexOf(b.dataset.flag || '') >= 0);
            });
            // 切到测试页
            const testerBtn = document.querySelector('.regex-tabs .btn-tab[data-tab="tester"]');
            if (testerBtn) testerBtn.click();
            execute();
            patternInput.focus();
        });
    }
};
