
module.exports = {
    init: function() {
        const skinOpts = document.querySelectorAll('.skin-opt');
        const fontSelect = document.getElementById('font-select');
        const body = document.body;

        // --- 1. 皮肤切换 ---
        skinOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                const skin = opt.getAttribute('data-skin');
                
                // 更新 UI 状态 (边框高亮)
                skinOpts.forEach(t => {
                    t.querySelector('div').style.transform = 'scale(1)';
                    t.querySelector('div').style.boxShadow = 'none';
                });
                opt.querySelector('div').style.transform = 'scale(1.1)';
                opt.querySelector('div').style.boxShadow = '0 0 15px rgba(255,255,255,0.1)';

                // 应用全局皮肤类
                body.classList.remove('skin-light', 'skin-midnight', 'skin-cyberpunk');
                if (skin !== 'default') {
                    body.classList.add(`skin-${skin}`);
                }
                
                // 保存到本地
                localStorage.setItem('devkit-skin', skin);
            });
        });

        // --- 2. 字体偏好切换 ---
        fontSelect?.addEventListener('change', () => {
            const fontType = fontSelect.value;
            let fontFamily = "'SF Pro Text', 'Inter', sans-serif";
            
            if (fontType === 'mono') {
                fontFamily = "'Fira Code', 'JetBrains Mono', 'ui-monospace', monospace";
            } else if (fontType === 'serif') {
                fontFamily = "Georgia, 'Times New Roman', serif";
            } else if (fontType === 'rounded') {
                fontFamily = "system-ui, -apple-system, sans-serif";
            }

            document.documentElement.style.setProperty('--font-family', fontFamily);
            localStorage.setItem('devkit-font-pref', fontType);
        });

        // --- 3. 初始化加载状态 ---
        const savedSkin = localStorage.getItem('devkit-skin') || 'default';
        const activeOpt = Array.from(skinOpts).find(opt => opt.getAttribute('data-skin') === savedSkin);
        if (activeOpt) activeOpt.click();

        const savedFont = localStorage.getItem('devkit-font-pref');
        if (savedFont && fontSelect) {
            fontSelect.value = savedFont;
            const event = new Event('change');
            fontSelect.dispatchEvent(event);
        }

        // 按钮交互
        document.getElementById('btn-check-update')?.addEventListener('click', () => {
            alert('当前已是最新版本! (v1.2.0)');
        });
    },

    // 静态方法：供全局初始化时调用
    applySavedSettings: function() {
        const body = document.body;
        const savedSkin = localStorage.getItem('devkit-skin');
        if (savedSkin && savedSkin !== 'default') {
            body.classList.add(`skin-${savedSkin}`);
        }
        
        const savedFont = localStorage.getItem('devkit-font-pref');
        if (savedFont) {
            let fontFamily = "'SF Pro Text', 'Inter', sans-serif";
            if (savedFont === 'mono') fontFamily = "'Fira Code', 'JetBrains Mono', monospace";
            else if (savedFont === 'serif') fontFamily = "Georgia, serif";
            document.documentElement.style.setProperty('--font-family', fontFamily);
        }
    }
};
