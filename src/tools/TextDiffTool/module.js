module.exports = {
    init: function() {
        const btnCompare = document.getElementById('btn-compare-text');
        const btnSwap = document.getElementById('btn-swap-text');
        const btnClear = document.getElementById('btn-clear-text');
        const leftInput = document.getElementById('text-left');
        const rightInput = document.getElementById('text-right');
        const resultsArea = document.getElementById('text-diff-results');
        const optOnlyDiff = document.getElementById('opt-only-diff');
        const ctxLines = document.getElementById('ctx-lines');

        // 闭包内保存最近一次 diff 结果，供 toolbar 切换时复用
        let lastDiff = [];

        // --- 1. 逐行对比算法（保留原有 lookahead 逻辑，附带原始行号） ---
        function computeDiff(text1, text2) {
            const lines1 = text1.split(/\r?\n/);
            const lines2 = text2.split(/\r?\n/);
            const raw = [];
            let i = 0, j = 0;
            let leftLn = 1, rightLn = 1;

            while (i < lines1.length || j < lines2.length) {
                if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
                    raw.push({ type: 'equal', value: lines1[i], leftLn, rightLn });
                    i++; j++; leftLn++; rightLn++;
                } else {
                    let foundMatch = false;
                    for (let lookAhead = j + 1; lookAhead < Math.min(j + 10, lines2.length); lookAhead++) {
                        if (lines1[i] === lines2[lookAhead]) {
                            for (let k = j; k < lookAhead; k++) {
                                raw.push({ type: 'added', value: lines2[k], leftLn: null, rightLn });
                                rightLn++;
                            }
                            j = lookAhead;
                            foundMatch = true;
                            break;
                        }
                    }
                    if (!foundMatch) {
                        if (i < lines1.length) {
                            raw.push({ type: 'removed', value: lines1[i], leftLn, rightLn: null });
                            i++; leftLn++;
                        } else if (j < lines2.length) {
                            raw.push({ type: 'added', value: lines2[j], leftLn: null, rightLn });
                            j++; rightLn++;
                        }
                    }
                }
            }
            return raw;
        }

        // --- 2. 按开关 + 上下文行数，生成展示项列表 ---
        // 每个展示项是 { kind: 'row', type, value, leftLn, rightLn } 或 { kind: 'ellipsis' }
        function buildVisibleRows(diff, onlyDiff, ctx) {
            if (!onlyDiff) {
                return diff.map(d => ({ kind: 'row', ...d }));
            }
            const diffIdx = [];
            diff.forEach((d, idx) => { if (d.type !== 'equal') diffIdx.push(idx); });
            if (diffIdx.length === 0) {
                return [{ kind: 'ellipsis', note: '一致' }];
            }
            const visible = new Set();
            diffIdx.forEach(idx => {
                for (let k = Math.max(0, idx - ctx); k <= Math.min(diff.length - 1, idx + ctx); k++) {
                    visible.add(k);
                }
            });
            const sorted = [...visible].sort((a, b) => a - b);
            const out = [];
            let prev = -2;
            sorted.forEach(i => {
                if (i > prev + 1) out.push({ kind: 'ellipsis' });
                out.push({ kind: 'row', ...diff[i] });
                prev = i;
            });
            return out;
        }

        // --- 3. 渲染（支持省略行） ---
        function renderRows(items) {
            resultsArea.innerHTML = '';

            const header = document.createElement('div');
            header.className = 'diff-header';
            header.innerHTML = '<div class="header-item pane-left">原始内容 (左侧)</div><div class="header-item">对比内容 (右侧)</div>';
            resultsArea.appendChild(header);

            items.forEach(item => {
                const row = document.createElement('div');

                if (item.kind === 'ellipsis') {
                    row.className = 'split-row row-ellipsis';
                    const left = document.createElement('div');
                    left.className = 'split-pane pane-left';
                    left.textContent = item.note ? `(${item.note})` : '⋯';
                    const right = document.createElement('div');
                    right.className = 'split-pane pane-right';
                    right.textContent = item.note ? `(${item.note})` : '⋯';
                    row.appendChild(left);
                    row.appendChild(right);
                    resultsArea.appendChild(row);
                    return;
                }

                row.className = `split-row row-${item.type}`;
                const leftPane = document.createElement('div');
                leftPane.className = 'split-pane pane-left';
                const rightPane = document.createElement('div');
                rightPane.className = 'split-pane pane-right';

                if (item.type === 'equal') {
                    leftPane.textContent = item.value;
                    if (item.leftLn) leftPane.setAttribute('data-ln', item.leftLn);
                    rightPane.textContent = item.value;
                    if (item.rightLn) rightPane.setAttribute('data-ln', item.rightLn);
                } else if (item.type === 'removed') {
                    leftPane.textContent = item.value;
                    if (item.leftLn) leftPane.setAttribute('data-ln', item.leftLn);
                    rightPane.className += ' empty-pane';
                } else if (item.type === 'added') {
                    leftPane.className += ' empty-pane';
                    rightPane.textContent = item.value;
                    if (item.rightLn) rightPane.setAttribute('data-ln', item.rightLn);
                }
                row.appendChild(leftPane);
                row.appendChild(rightPane);
                resultsArea.appendChild(row);
            });
        }

        function rerender() {
            const onlyDiff = !!(optOnlyDiff && optOnlyDiff.checked);
            const ctx = ctxLines ? (parseInt(ctxLines.value, 10) || 0) : 0;
            const items = buildVisibleRows(lastDiff, onlyDiff, ctx);
            renderRows(items);
        }

        // --- 4. 事件绑定 ---
        btnCompare?.addEventListener('click', () => {
            const lText = leftInput.value;
            const rText = rightInput.value;
            if (!lText && !rText) return alert('请输入需要对比的文本！');
            lastDiff = computeDiff(lText, rText);
            rerender();
        });

        btnSwap?.addEventListener('click', () => {
            const tmp = leftInput.value;
            leftInput.value = rightInput.value;
            rightInput.value = tmp;
        });

        btnClear?.addEventListener('click', () => {
            leftInput.value = '';
            rightInput.value = '';
            lastDiff = [];
            resultsArea.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding-top: 40px;">数据已清空</div>';
        });

        // toolbar 变化 → 复用最近一次 diff 结果重新渲染
        optOnlyDiff?.addEventListener('change', rerender);
        ctxLines?.addEventListener('change', rerender);
    }
};
