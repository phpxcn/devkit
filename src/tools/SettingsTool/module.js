
module.exports = {
    // 已下线皮肤的迁移映射：暗夜/赛博 → 护眼皮肤
    LEGACY_SKINS: { midnight: 'green', cyberpunk: 'sepia' },

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

                // 应用全局皮肤类（顺带清理历史遗留皮肤类）
                body.classList.remove('skin-light', 'skin-green', 'skin-sepia', 'skin-midnight', 'skin-cyberpunk');
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
        const rawSkin = localStorage.getItem('devkit-skin') || 'default';
        const savedSkin = this.LEGACY_SKINS[rawSkin] || rawSkin;
        const activeOpt = Array.from(skinOpts).find(opt => opt.getAttribute('data-skin') === savedSkin);
        if (activeOpt) activeOpt.click();

        const savedFont = localStorage.getItem('devkit-font-pref');
        if (savedFont && fontSelect) {
            fontSelect.value = savedFont;
            const event = new Event('change');
            fontSelect.dispatchEvent(event);
        }

        // “关于”版本号：从主进程取 package.json 的 version，避免页面写死
        window.electron.getAppVersion?.().then(v => {
            const el = document.getElementById('app-version');
            if (el && v) el.textContent = `版本 v${v} (Stable)`;
        });

        // 按钮交互：真实调用主进程的 electron-updater 检查
        const btn = document.getElementById('btn-check-update');
        const $progBox = document.getElementById('update-progress-box');
        const $progText = document.getElementById('update-progress-text');
        const $progBar = document.getElementById('update-progress-bar');

        const showProgress = (text, percent) => {
            if (!$progBox) return;
            $progBox.style.display = 'block';
            if ($progText) $progText.textContent = text;
            if ($progBar) $progBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        };

        btn?.addEventListener('click', async () => {
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = '检查中…';
            try {
                const res = await window.electron.checkForUpdate();
                if (res.ok && res.status === 'latest') {
                    alert(`当前已是最新版本! (v${res.version})`);
                } else if (res.ok && res.status === 'available') {
                    showProgress(`发现新版本 v${res.version}，正在下载…`, 0);
                } else {
                    alert(`检查更新失败：${res.message}`);
                }
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });

        // 订阅主进程更新事件：进度 / 下载完成（主进程会直接重启安装）/ 失败
        window.electron.onUpdateProgress?.((p) => {
            const mb = p.total ? ` (${(p.transferred / 1048576).toFixed(1)}/${(p.total / 1048576).toFixed(1)} MB)` : '';
            showProgress(`正在下载更新… ${p.percent}%${mb}`, p.percent);
        });
        window.electron.onUpdateDownloaded?.(() => {
            showProgress('下载完成，正在重启安装…', 100);
        });
        window.electron.onUpdateError?.((d) => {
            showProgress(`更新失败：${d.message}`, 0);
        });
    },

    // 静态方法：供全局初始化时调用
    applySavedSettings: function() {
        const body = document.body;
        const savedSkin = localStorage.getItem('devkit-skin');
        if (savedSkin && savedSkin !== 'default') {
            const migrated = this.LEGACY_SKINS[savedSkin] || savedSkin;
            body.classList.add(`skin-${migrated}`);
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
