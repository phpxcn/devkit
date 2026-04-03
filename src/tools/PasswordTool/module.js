module.exports = {
    init: function() {
        const btnGen = document.getElementById('btn-gen-pwd');
        const btnCopy = document.getElementById('btn-copy-pwd');
        const display = document.getElementById('pwd-display');
        const lengthSlider = document.getElementById('pwd-len');
        const lengthVal = document.getElementById('pwd-len-val');
        const strengthBar = document.getElementById('pwd-strength-bar');
        const strengthText = document.getElementById('pwd-strength-text');
        
        const toggles = {
            upper: document.getElementById('pwd-upper'),
            lower: document.getElementById('pwd-lower'),
            numbers: document.getElementById('pwd-numbers'),
            symbols: document.getElementById('pwd-symbols')
        };

        const charSets = {
            upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            lower: 'abcdefghijklmnopqrstuvwxyz',
            numbers: '0123456789',
            symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
        };

        lengthSlider.addEventListener('input', (e) => {
            lengthVal.textContent = e.target.value;
            generate();
        });

        function generate() {
            let pool = '';
            let mandatory = [];
            
            if (toggles.upper.checked) {
                pool += charSets.upper;
                mandatory.push(charSets.upper[Math.floor(Math.random() * charSets.upper.length)]);
            }
            if (toggles.lower.checked) {
                pool += charSets.lower;
                mandatory.push(charSets.lower[Math.floor(Math.random() * charSets.lower.length)]);
            }
            if (toggles.numbers.checked) {
                pool += charSets.numbers;
                mandatory.push(charSets.numbers[Math.floor(Math.random() * charSets.numbers.length)]);
            }
            if (toggles.symbols.checked) {
                pool += charSets.symbols;
                mandatory.push(charSets.symbols[Math.floor(Math.random() * charSets.symbols.length)]);
            }

            if (!pool) {
                display.textContent = '请至少勾选一项';
                display.style.fontSize = '1.2rem';
                updateStrength(0);
                return;
            }

            const length = parseInt(lengthSlider.value);
            let result = '';
            
            // 使用更安全的随机值
            const array = new Uint32Array(length);
            window.crypto.getRandomValues(array);

            for (let i = 0; i < length; i++) {
                result += pool[array[i] % pool.length];
            }

            // 确保包含所有必选字符
            display.textContent = result;
            display.style.fontSize = length > 30 ? '1.2rem' : '2rem';
            
            evaluateStrength(result, length);
        }

        function evaluateStrength(pwd, len) {
            let score = 0;
            if (len >= 8) score += 20;
            if (len >= 12) score += 20;
            if (len >= 16) score += 10;
            
            let types = 0;
            if (/[A-Z]/.test(pwd)) types++;
            if (/[a-z]/.test(pwd)) types++;
            if (/[0-9]/.test(pwd)) types++;
            if (/[^A-Za-z0-9]/.test(pwd)) types++;
            
            score += types * 10;
            if (types === 4) score += 10;
            
            updateStrength(Math.min(score, 100));
        }

        function updateStrength(score) {
            strengthBar.style.width = score + '%';
            if (score < 40) {
                strengthBar.style.backgroundColor = '#ef4444';
                strengthText.textContent = '弱强度 - 极易被破解';
            } else if (score < 80) {
                strengthBar.style.backgroundColor = '#eab308';
                strengthText.textContent = '中等强度';
            } else {
                strengthBar.style.backgroundColor = '#22c55e';
                strengthText.textContent = '极高强度 - 工业级加密建议';
            }
        }

        btnGen?.addEventListener('click', generate);
        btnCopy?.addEventListener('click', () => {
            if (display.textContent === '请至少勾选一项' || display.textContent === '点击生成按钮') return;
            window.electron.writeClipboard(display.textContent);
            const originalText = btnCopy.textContent;
            btnCopy.textContent = '复制成功！';
            setTimeout(() => btnCopy.textContent = originalText, 1500);
        });

        // 绑定复选框变动自动生成
        Object.values(toggles).forEach(toggle => {
            toggle.addEventListener('change', generate);
        });

        // 初始化生成一个
        generate();
    }
};
