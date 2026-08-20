module.exports = {
    init: function () {
        // ────────────────── 引用 ──────────────────
        const input = document.getElementById('cron-input');
        const preset = document.getElementById('cron-preset');
        const btnParse = document.getElementById('btn-parse-cron');
        const btnClear = document.getElementById('btn-clear-cron');
        const btnCopy = document.getElementById('btn-copy-cron');
        const countSel = document.getElementById('cron-count');
        const descBox = document.getElementById('cron-desc');
        const nextList = document.getElementById('cron-next-list');
        const errorBox = document.getElementById('cron-error');
        const statusBadge = document.getElementById('cron-status-badge');

        // ────────────────── 工具函数 ──────────────────
        function setBadge(kind, text) {
            statusBadge.className = 'status-badge ' + (kind ? 'badge-' + kind : '');
            statusBadge.textContent = text || '';
        }
        function showError(msg) {
            errorBox.style.display = 'block';
            errorBox.textContent = msg;
            descBox.innerHTML = '<span style="color: var(--text-dim);">—</span>';
            nextList.innerHTML = '<div class="empty-state" style="min-height: 120px;">表达式无效</div>';
        }
        function clearError() { errorBox.style.display = 'none'; errorBox.textContent = ''; }

        function pad2(n) { return String(n).padStart(2, '0'); }
        function fmt(dt) {
            const wd = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()];
            return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())} 周${wd}`;
        }
        function fmtIso(dt) {
            return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
        }

        // ────────────────── Cron 字段解析（核心） ──────────────────
        // 解析单个字段表达式为允许的数值 Set。min/max 为字段合法区间。
        // 支持: *  n  a,b,c  a-b  */n  a-b/n  a-n (自动判断左闭右闭)
        function parseField(expr, min, max, allowQuestion) {
            if (allowQuestion && (expr === '?' || expr === '')) return parseField('*', min, max);
            if (expr === '*' || expr === '?') {
                const s = new Set();
                for (let i = min; i <= max; i++) s.add(i);
                return s;
            }
            const s = new Set();
            const parts = String(expr).split(',');
            for (const part of parts) {
                let body = part.trim();
                let step = 1;
                const slashIdx = body.indexOf('/');
                if (slashIdx >= 0) {
                    step = parseInt(body.slice(slashIdx + 1), 10);
                    if (isNaN(step) || step <= 0) throw new Error(`步长无效: "${part}"`);
                    body = body.slice(0, slashIdx);
                }
                let from, to;
                if (body === '*') {
                    from = min; to = max;
                } else {
                    const dashIdx = body.indexOf('-');
                    if (dashIdx >= 0) {
                        from = parseInt(body.slice(0, dashIdx), 10);
                        to = parseInt(body.slice(dashIdx + 1), 10);
                    } else {
                        from = parseInt(body, 10);
                        to = (slashIdx >= 0) ? max : from; // a/b 等价于 a-max 步长 b
                    }
                    if (isNaN(from) || isNaN(to)) throw new Error(`值无效: "${part}"`);
                }
                if (from < min || to > max || from > to) {
                    throw new Error(`范围越界: "${part}" (允许 ${min}-${max})`);
                }
                for (let v = from; v <= to; v += step) s.add(v);
            }
            return s;
        }

        // 解析整段表达式, 返回 5 个 Set (min/hour/day/month/wday)
        // 周字段规范: 0/7 都代表周日, 这里统一到 0-6
        function parseCron(expr) {
            const tokens = String(expr).trim().split(/\s+/);
            if (tokens.length !== 5) throw new Error('必须为 5 个字段（分 时 日 月 周）, 实际 ' + tokens.length + ' 个');
            const [m, h, d, mo, w] = tokens;
            const minSet  = parseField(m, 0, 59, false);
            const hourSet = parseField(h, 0, 23, false);
            const daySet  = parseField(d, 1, 31, true);
            const monSet  = parseField(mo, 1, 12, false);
            let   wdaySet = parseField(w, 0, 7, true);
            // 7 -> 0（周日）
            if (wdaySet.has(7)) { wdaySet.delete(7); wdaySet.add(0); }
            return {
                raw: { m, h, d, mo, w },
                min: minSet, hour: hourSet, day: daySet, month: monSet, wday: wdaySet,
                hasQDay:  (d === '?'),
                hasQWday: (w === '?')
            };
        }

        // ────────────────── 计算下次匹配时间 ──────────────────
        // 策略: 从 start 的下一分钟开始遍历, 逐个 min 匹配。为避免死循环, 限制最多搜索 3 年。
        function nextMatches(cron, start, n) {
            const results = [];
            const d = new Date(start.getTime());
            // 重置到下一分钟 00 秒, 从下一分钟开始算第一个候选
            d.setSeconds(0, 0);
            d.setMinutes(d.getMinutes() + 1);
            const limit = new Date(start.getTime() + 365 * 3 * 24 * 3600 * 1000); // 3 年上限
            let steps = 0;
            while (results.length < n && d < limit) {
                steps++;
                if (steps > 1_000_000) break; // 安全硬上限
                const mn  = d.getMinutes();
                const hr  = d.getHours();
                const dy  = d.getDate();
                const mo  = d.getMonth() + 1;
                const wd  = d.getDay();
                // 字段是否匹配 (日/周 遵循 Unix cron: 当两者都是 * 时, 任一匹配即通过; 任一被限制时取交集(AND))
                const mMatch = cron.min.has(mn);
                const hMatch = cron.hour.has(hr);
                const monMatch = cron.month.has(mo);
                let dwMatch;
                const dayLimited  = cron.raw.d  !== '*' && cron.raw.d  !== '?';
                const wdayLimited = cron.raw.w !== '*' && cron.raw.w !== '?';
                if (!dayLimited && !wdayLimited) {
                    dwMatch = true; // 都不限 -> 任意天
                } else if (dayLimited && wdayLimited) {
                    dwMatch = cron.day.has(dy) || cron.wday.has(wd); // Unix cron: OR
                } else if (dayLimited) {
                    dwMatch = cron.day.has(dy);
                } else {
                    dwMatch = cron.wday.has(wd);
                }
                if (mMatch && hMatch && monMatch && dwMatch) {
                    results.push(new Date(d.getTime()));
                }
                d.setMinutes(d.getMinutes() + 1);
            }
            return results;
        }

        // ────────────────── 中文解释生成 ──────────────────
        function explainField(expr, label, min, max, isWday) {
            if (expr === '*' || expr === '?') return '';
            // 单值
            if (/^\d+$/.test(expr)) {
                return isWday
                    ? `每${weekdayCN(parseInt(expr))}`
                    : `${label} ${expr}`;
            }
            // 列表 a,b,c
            if (/^\d+(,\d+)+$/.test(expr)) {
                const vals = expr.split(',').map(Number);
                const mapped = isWday ? vals.map(v => '周' + weekdayCN(v)).join('、') : vals.join('、');
                return `${label}为 ${mapped}`;
            }
            // 范围 a-b
            if (/^\d+-\d+$/.test(expr)) {
                const [a, b] = expr.split('-').map(Number);
                const s = isWday ? `周${weekdayCN(a)} 至 周${weekdayCN(b)}` : `${a} 至 ${b}`;
                return `${label}在 ${s}`;
            }
            // 步长 */n 或 a-b/n 或 a/n
            const slash = expr.split('/');
            if (slash.length === 2) {
                const step = slash[1];
                let range;
                if (slash[0] === '*') {
                    range = isWday ? `每周` : `每${label}`;
                } else if (/^\d+$/.test(slash[0])) {
                    range = `${label}从 ${slash[0]} 起`;
                } else if (/^\d+-\d+$/.test(slash[0])) {
                    const [a, b] = slash[0].split('-');
                    range = `${label} ${a} 到 ${b}`;
                } else {
                    range = expr;
                }
                return `${range}, 每 ${step}${label === '分' ? '分钟' : label === '时' ? '小时' : ''}执行一次`;
            }
            return `${label} = ${expr}`;
        }
        function weekdayCN(n) {
            const m = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' };
            return m[n] ?? String(n);
        }
        function monthCN(n) {
            return n + ' 月';
        }

        function buildDescription(cron) {
            const pieces = [];
            // 日/月 优先
            if (cron.raw.mo !== '*') {
                pieces.push(explainField(cron.raw.mo, '月份', 1, 12) || '每年');
            }
            if (cron.raw.d !== '*' && cron.raw.d !== '?') {
                pieces.push(explainField(cron.raw.d, '每月第', 1, 31) || '');
            }
            if (cron.raw.w !== '*' && cron.raw.w !== '?') {
                pieces.push(explainField(cron.raw.w, '星期', 0, 7, true) || '');
            }
            // 时分
            const hourPart = explainField(cron.raw.h, '时', 0, 23);
            const minPart  = explainField(cron.raw.m, '分', 0, 59);
            // 如果两者都是固定数字, 合并成 "HH:MM"
            if (/^\d+$/.test(cron.raw.h) && /^\d+$/.test(cron.raw.m)) {
                pieces.push(`在 ${pad2(+cron.raw.h)}:${pad2(+cron.raw.m)} 执行`);
            } else if (hourPart || minPart) {
                pieces.push([hourPart, minPart].filter(Boolean).join('，'));
            } else {
                pieces.push('每分钟执行');
            }
            return pieces.filter(Boolean).join('，') + '。';
        }

        // ────────────────── 核心入口: 解析并渲染 ──────────────────
        function parseAndRender() {
            const expr = input.value.trim();
            if (!expr) {
                setBadge('', '');
                clearError();
                descBox.innerHTML = '<span style="color: var(--text-dim);">请输入 Cron 表达式</span>';
                nextList.innerHTML = '<div class="empty-state" style="min-height: 120px;">输入表达式后显示未来 N 次执行时间</div>';
                return;
            }
            try {
                const cron = parseCron(expr);
                clearError();
                setBadge('ok', '格式正确');

                // 解释说明
                const desc = buildDescription(cron);
                descBox.textContent = desc;

                // 未来 N 次
                const count = parseInt(countSel.value, 10) || 20;
                const dates = nextMatches(cron, new Date(), count);
                if (!dates.length) {
                    nextList.innerHTML = '<div class="empty-state" style="min-height: 120px;">3 年内没有匹配时间</div>';
                } else {
                    const html = '<ul>' + dates.map((dt, i) => `
                        <li>
                            <span class="idx">#${i + 1}</span>
                            <span class="dt">${fmt(dt)}</span>
                            <span class="iso">${fmtIso(dt)}</span>
                            <button class="copy-btn" data-copy="${encodeURIComponent(fmt(dt))}">复制</button>
                        </li>
                    `).join('') + '</ul>';
                    nextList.innerHTML = html;
                }
            } catch (e) {
                setBadge('error', '格式错误');
                showError(e.message);
            }
        }

        // ────────────────── debounce ──────────────────
        let t;
        function schedule(fn, ms) {
            clearTimeout(t);
            t = setTimeout(fn, ms);
        }

        input.addEventListener('input', () => schedule(parseAndRender, 250));
        countSel.addEventListener('change', () => schedule(parseAndRender, 100));
        btnParse.addEventListener('click', parseAndRender);

        preset.addEventListener('change', () => {
            if (!preset.value) return;
            input.value = preset.value;
            parseAndRender();
        });

        // 用户手动改表达式时，如果和当前模板值不再对应，就清空下拉框选择，保持显示和实际同步
        input.addEventListener('input', () => {
            if (!preset.value) return;
            if (input.value.trim() !== preset.value) preset.value = '';
        });

        btnClear.addEventListener('click', () => {
            input.value = '';
            preset.value = '';
            parseAndRender();
        });

        btnCopy.addEventListener('click', () => {
            const v = input.value.trim();
            if (!v) return;
            window.electron && window.electron.writeClipboard(v);
            const orig = btnCopy.textContent;
            btnCopy.textContent = '已复制！';
            setTimeout(() => btnCopy.textContent = orig, 1200);
        });

        // 复制单个执行时间
        nextList.addEventListener('click', e => {
            const btn = e.target.closest('.copy-btn');
            if (!btn) return;
            const v = decodeURIComponent(btn.getAttribute('data-copy') || '');
            if (!v) return;
            window.electron && window.electron.writeClipboard(v);
            const orig = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = orig, 900);
        });

        // 初始自动渲染空态
        parseAndRender();
    }
};
