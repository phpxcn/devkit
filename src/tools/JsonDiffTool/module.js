const JSON5 = require('json5');

module.exports = {
    init: function() {
        const btnCompare = document.getElementById('btn-compare-json');
        const btnSwap = document.getElementById('btn-swap-json');
        const btnClear = document.getElementById('btn-clear-diff');
        const leftInput = document.getElementById('json-left');
        const rightInput = document.getElementById('json-right');
        const resultsArea = document.getElementById('diff-results');

        // --- 1. 对比逻辑 ---
        function getDiff(obj1, obj2, path = '') {
            let diffs = [];

            // 情况 A：类型不同
            if (typeof obj1 !== typeof obj2) {
                diffs.push({ path, type: 'changed', oldVal: obj1, newVal: obj2 });
                return diffs;
            }

            // 情况 B：非对象/数组 (基本类型比对)
            if (obj1 === null || typeof obj1 !== 'object') {
                if (obj1 !== obj2) {
                    diffs.push({ path, type: 'changed', oldVal: obj1, newVal: obj2 });
                }
                return diffs;
            }

            // 情况 C：数组比对
            if (Array.isArray(obj1)) {
                if (!Array.isArray(obj2)) {
                    diffs.push({ path, type: 'changed', oldVal: obj1, newVal: obj2 });
                } else {
                    const maxLen = Math.max(obj1.length, obj2.length);
                    for (let i = 0; i < maxLen; i++) {
                        if (i >= obj1.length) {
                            diffs.push({ path: `${path}[${i}]`, type: 'added', newVal: obj2[i] });
                        } else if (i >= obj2.length) {
                            diffs.push({ path: `${path}[${i}]`, type: 'removed', oldVal: obj1[i] });
                        } else {
                            diffs = diffs.concat(getDiff(obj1[i], obj2[i], `${path}[${i}]`));
                        }
                    }
                }
                return diffs;
            }

            // 情况 D：普通对象比对
            const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
            allKeys.forEach(key => {
                const currentPath = path ? `${path}.${key}` : key;
                if (!(key in obj2)) {
                    diffs.push({ path: currentPath, type: 'removed', oldVal: obj1[key] });
                } else if (!(key in obj1)) {
                    diffs.push({ path: currentPath, type: 'added', newVal: obj2[key] });
                } else {
                    diffs = diffs.concat(getDiff(obj1[key], obj2[key], currentPath));
                }
            });

            return diffs;
        }

        function renderDiffs(diffList) {
            resultsArea.innerHTML = '';
            if (diffList.length === 0) {
                resultsArea.innerHTML = '<div style="color: var(--accent-color); text-align: center; padding: 20px;">数据完全一致！✨</div>';
                return;
            }

            diffList.forEach(diff => {
                const div = document.createElement('div');
                div.className = `diff-item diff-${diff.type}`;
                
                let badge = '';
                let content = `<span class="diff-path">${diff.path || 'Root'}</span>`;

                if (diff.type === 'removed') {
                    badge = '<span style="color: #ef4444; font-weight: 700;">[右侧缺失]</span>';
                    content += `${badge} <span class="diff-val-old">${JSON.stringify(diff.oldVal)}</span>`;
                } else if (diff.type === 'added') {
                    badge = '<span style="color: #22c55e; font-weight: 700;">[右侧新增]</span>';
                    content += `${badge} <span class="diff-val-new">${JSON.stringify(diff.newVal)}</span>`;
                } else {
                    badge = '<span style="color: #eab308; font-weight: 700;">[值变更]</span>';
                    content += `${badge} <span class="diff-val-old">${JSON.stringify(diff.oldVal)}</span> → <span class="diff-val-new">${JSON.stringify(diff.newVal)}</span>`;
                }
                
                div.innerHTML = content;
                resultsArea.appendChild(div);
            });
        }

        // --- 2. 事件绑定 ---
        btnCompare?.addEventListener('click', () => {
            try {
                const val1 = leftInput.value.trim();
                const val2 = rightInput.value.trim();
                if (!val1 || !val2) return alert('请输入两个 JSON 字符串进行对比！');

                const obj1 = JSON5.parse(val1);
                const obj2 = JSON5.parse(val2);

                const differences = getDiff(obj1, obj2);
                renderDiffs(differences);
            } catch (e) {
                alert('JSON 解析错误，请检查输入格式是否正确！\n' + e.message);
            }
        });

        btnSwap?.addEventListener('click', () => {
            const tmp = leftInput.value;
            leftInput.value = rightInput.value;
            rightInput.value = tmp;
        });

        btnClear?.addEventListener('click', () => {
            leftInput.value = '';
            rightInput.value = '';
            resultsArea.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding-top: 40px;">数据清空，等待输入...</div>';
        });
    }
};
