module.exports = {
    init: function() {
        const btnCompare = document.getElementById('btn-compare-text');
        const btnSwap = document.getElementById('btn-swap-text');
        const btnClear = document.getElementById('btn-clear-text');
        const leftInput = document.getElementById('text-left');
        const rightInput = document.getElementById('text-right');
        const resultsArea = document.getElementById('text-diff-results');

        // --- 1. 简单的逐行对比算法 ---
        // 注意：这并未实现复杂的 LCS 算法，但对大多数文本片段对比效果极佳
        function computeDiff(text1, text2) {
            const lines1 = text1.split(/\r?\n/);
            const lines2 = text2.split(/\r?\n/);
            const diff = [];
            
            let i = 0, j = 0;
            while (i < lines1.length || j < lines2.length) {
                if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
                    diff.push({ type: 'equal', value: lines1[i] });
                    i++; j++;
                } else {
                    // 检查是否是由于右侧新增导致的
                    let foundMatch = false;
                    for(let lookAhead = j + 1; lookAhead < Math.min(j + 10, lines2.length); lookAhead++) {
                        if (lines1[i] === lines2[lookAhead]) {
                            // 发现了右侧新增的一系列行
                            for(let k = j; k < lookAhead; k++) {
                                diff.push({ type: 'added', value: lines2[k] });
                            }
                            j = lookAhead;
                            foundMatch = true;
                            break;
                        }
                    }

                    if (!foundMatch) {
                        // 依然不匹配，说明左侧这行是被删掉的或者被替换了
                        if (i < lines1.length) {
                            diff.push({ type: 'removed', value: lines1[i] });
                            i++;
                        } else if (j < lines2.length) {
                            diff.push({ type: 'added', value: lines2[j] });
                            j++;
                        }
                    }
                }
            }
            return diff;
        }

        function renderDiff(diff) {
            resultsArea.innerHTML = '';
            
            // 1. 添加表头
            const header = document.createElement('div');
            header.className = 'diff-header';
            header.innerHTML = '<div class="header-item pane-left">原始内容 (左侧)</div><div class="header-item">对比内容 (右侧)</div>';
            resultsArea.appendChild(header);

            // 记录左右两侧各自的行号
            let leftLn = 1;
            let rightLn = 1;

            // 2. 逐行双栏渲染
            diff.forEach((item) => {
                const row = document.createElement('div');
                row.className = `split-row row-${item.type}`;
                
                const leftPane = document.createElement('div');
                leftPane.className = 'split-pane pane-left';
                
                const rightPane = document.createElement('div');
                rightPane.className = 'split-pane pane-right';

                if (item.type === 'equal') {
                    leftPane.textContent = item.value;
                    leftPane.setAttribute('data-ln', leftLn++);
                    rightPane.textContent = item.value;
                    rightPane.setAttribute('data-ln', rightLn++);
                } else if (item.type === 'removed') {
                    leftPane.textContent = item.value;
                    leftPane.setAttribute('data-ln', leftLn++);
                    rightPane.className += ' empty-pane';
                } else if (item.type === 'added') {
                    leftPane.className += ' empty-pane';
                    rightPane.textContent = item.value;
                    rightPane.setAttribute('data-ln', rightLn++);
                }

                row.appendChild(leftPane);
                row.appendChild(rightPane);
                resultsArea.appendChild(row);
            });
        }

        // --- 2. 事件绑定 ---
        btnCompare?.addEventListener('click', () => {
            const lText = leftInput.value;
            const rText = rightInput.value;
            
            if (!lText && !rText) return alert('请输入需要对比的文本！');
            
            const diffResults = computeDiff(lText, rText);
            renderDiff(diffResults);
        });

        btnSwap?.addEventListener('click', () => {
            const tmp = leftInput.value;
            leftInput.value = rightInput.value;
            rightInput.value = tmp;
        });

        btnClear?.addEventListener('click', () => {
            leftInput.value = '';
            rightInput.value = '';
            resultsArea.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding-top: 40px;">数据已清空</div>';
        });
    }
};
