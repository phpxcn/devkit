module.exports = {
    init: function() {
        // ───────── 顶部 tab 切换 ─────────
        const tabs = document.querySelectorAll('.numeric-tabs .btn-tab');
        const panels = document.querySelectorAll('.numeric-panel');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.getAttribute('data-tab');
                panels.forEach(p => {
                    p.style.display = (p.getAttribute('data-panel') === target) ? '' : 'none';
                });
            });
        });

        // ───────── UUID 模块 ─────────
        const versionBtns = document.querySelectorAll('#uuid-version-group .btn-tab');
        const caseBtns = document.querySelectorAll('#uuid-case-group .btn-tab');
        const hyphenBtns = document.querySelectorAll('#uuid-hyphen-group .btn-tab');
        const countInput = document.getElementById('uuid-count');
        const btnGen = document.getElementById('btn-gen-uuid');
        const btnCopy = document.getElementById('btn-copy-uuid');
        const output = document.getElementById('uuid-output');

        let uuidVersion = 'v4';
        let uuidCase = 'lower';
        let uuidHyphen = 'yes';

        function bindToggleGroup(btns, onChange) {
            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    btns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    onChange(btn.getAttribute('data-version') || btn.getAttribute('data-case') || btn.getAttribute('data-hyphen'));
                });
            });
        }
        bindToggleGroup(versionBtns, v => { uuidVersion = v; });
        bindToggleGroup(caseBtns, v => { uuidCase = v; });
        bindToggleGroup(hyphenBtns, v => { uuidHyphen = v; });

        // UUID v4: 使用原生 crypto.randomUUID
        function uuidv4() {
            return crypto.randomUUID();
        }

        // UUID v7: 时间戳高位 + 随机位
        function uuidv7() {
            const timestamp = Date.now();
            const timestampHex = timestamp.toString(16).padStart(12, '0');
            const randA = Math.floor(Math.random() * 0x1000);
            const randB = Math.floor(Math.random() * 0x10000000);
            const randC = Math.floor(Math.random() * 0x100000000);
            // version 7
            const part2 = (0x7 << 12 | randA).toString(16).padStart(4, '0');
            // variant 10xxxxxx
            const part3 = (0x8000 | (randB & 0x0FFF)).toString(16).padStart(4, '0');
            const part4 = randC.toString(16).padStart(8, '0');
            return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8)}-${part2}-${part3}-${part4}`;
        }

        // 格式化单条 UUID
        function formatUuid(raw) {
            let str = raw;
            if (uuidHyphen === 'no') str = str.replace(/-/g, '');
            if (uuidCase === 'upper') str = str.toUpperCase();
            else str = str.toLowerCase();
            return str;
        }

        function generateUuids() {
            let count = parseInt(countInput.value, 10);
            if (isNaN(count) || count < 1) count = 1;
            if (count > 1000) count = 1000;
            countInput.value = count;

            const items = [];
            for (let i = 0; i < count; i++) {
                const raw = uuidVersion === 'v7' ? uuidv7() : uuidv4();
                items.push(formatUuid(raw));
            }
            output.value = items.join('\n');
        }

        btnGen?.addEventListener('click', generateUuids);
        countInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') generateUuids();
        });

        btnCopy?.addEventListener('click', () => {
            if (!output.value) return;
            window.electron.writeClipboard(output.value);
            const originalText = btnCopy.textContent;
            btnCopy.textContent = '已复制！';
            setTimeout(() => { btnCopy.textContent = originalText; }, 1200);
        });

        // ───────── 进制转换模块 ─────────
        const baseInput = document.getElementById('base-input');
        const baseFrom = document.getElementById('base-from');
        const baseError = document.getElementById('base-error');
        const baseMeta = document.getElementById('base-meta');
        const outEls = {
            '2': document.getElementById('base-out-2'),
            '8': document.getElementById('base-out-8'),
            '10': document.getElementById('base-out-10'),
            '16': document.getElementById('base-out-16')
        };

        // 按进制决定允许字符集（用于校验）
        function allowedChars(base) {
            if (base === 2) return /^[01]+$/;
            if (base === 8) return /^[0-7]+$/;
            if (base === 10) return /^\d+$/;
            if (base === 16) return /^[0-9a-fA-F]+$/;
            return null;
        }
        const baseNames = { 2: '二进制', 8: '八进制', 10: '十进制', 16: '十六进制' };

        let debounceTimer = null;

        function setBaseError(msg) {
            if (msg) {
                baseError.textContent = msg;
                baseError.style.display = 'block';
            } else {
                baseError.style.display = 'none';
                baseError.textContent = '';
            }
        }

        function clearOutputs() {
            Object.keys(outEls).forEach(k => { outEls[k].value = ''; });
            baseMeta.textContent = '等待输入...';
        }

        function describeBitLength(decimalValue) {
            if (decimalValue < 0) return '负数不在位长说明范围内';
            const bits = decimalValue.toString(2).length;
            // 同时给出无符号位宽判断
            let label;
            if (decimalValue <= 0xFF) label = '8-bit unsigned';
            else if (decimalValue <= 0xFFFF) label = '16-bit unsigned';
            else if (decimalValue <= 0xFFFFFFFF) label = '32-bit unsigned';
            else if (decimalValue <= 0xFFFFFFFFFFFFFFFF) label = '64-bit unsigned';
            else label = '超过 64-bit unsigned';
            const inSafe = decimalValue <= Number.MAX_SAFE_INTEGER;
            return `实际有效位宽: ${bits} bit ｜ 匹配: ${label}${inSafe ? '' : ' ｜ 超过 53-bit 安全整数范围'}`;
        }

        function convertBase() {
            const raw = baseInput.value.trim();
            const fromBase = parseInt(baseFrom.value, 10);

            if (!raw) {
                clearOutputs();
                setBaseError('');
                return;
            }

            // 校验字符合法性
            const regex = allowedChars(fromBase);
            // 十进制允许负号开头
            const checkStr = (fromBase === 10 && raw.startsWith('-')) ? raw.slice(1) : raw;
            if (!regex || !regex.test(checkStr)) {
                clearOutputs();
                setBaseError(`输入包含非法字符（${baseNames[fromBase]} 仅允许：${baseNames[fromBase] === '二进制' ? '0、1' : baseNames[fromBase] === '八进制' ? '0~7' : baseNames[fromBase] === '十进制' ? '0~9' : '0~9、a~f'}）`);
                return;
            }

            // 超大数检测：字符串过长直接提示
            if (raw.replace(/^-/, '').length > 15 && fromBase !== 16) {
                clearOutputs();
                setBaseError('数值过大：超过 53-bit 安全整数范围，JavaScript 原生 Number 会丢失精度');
                return;
            }

            const decimalValue = parseInt(raw, fromBase);
            if (isNaN(decimalValue)) {
                clearOutputs();
                setBaseError('无法解析为有效数字');
                return;
            }

            setBaseError('');

            // 超过安全整数范围提示
            if (decimalValue > Number.MAX_SAFE_INTEGER) {
                Object.keys(outEls).forEach(k => { outEls[k].value = ''; });
                outEls[String(fromBase)].value = raw; // 原值保留
                baseMeta.textContent = '该数值超过 53-bit 安全整数范围（' + Number.MAX_SAFE_INTEGER + '），转换结果可能丢精度';
                return;
            }

            // 正常输出各进制
            outEls['2'].value = decimalValue.toString(2);
            outEls['8'].value = decimalValue.toString(8);
            outEls['10'].value = decimalValue.toString(10);
            outEls['16'].value = decimalValue.toString(16).toUpperCase();

            baseMeta.textContent = describeBitLength(decimalValue);
        }

        // 源进制切换立即重新转换
        baseFrom?.addEventListener('change', () => {
            // 重置输入占位符
            baseInput.placeholder = `输入${baseNames[baseFrom.value]}数字...`;
            convertBase();
        });

        // 输入 debounce 200ms
        baseInput?.addEventListener('input', () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(convertBase, 200);
        });

        // 初始化占位符
        if (baseInput) {
            baseInput.placeholder = `输入${baseNames[baseFrom.value]}数字...`;
        }
    }
};
