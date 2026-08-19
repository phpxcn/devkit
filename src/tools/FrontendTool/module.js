module.exports = {
    init: function () {
        // ============ 通用工具: HTML 转义/反转义 ============
        // 转义特殊字符: & < > " ' (同时用于历史渲染的 XSS 防护与 HTML 工具)
        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
        function unescapeHtml(s) {
            const div = document.createElement('div');
            div.innerHTML = s;
            return div.textContent || '';
        }

        // ============ 1. Tab 切换 ============
        const tabBtns = document.querySelectorAll('.frontend-tabs button');
        const panelColor = document.getElementById('tab-color');
        const panelHtml = document.getElementById('tab-html');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.getAttribute('data-tab');
                panelColor.style.display = tab === 'color' ? 'block' : 'none';
                panelHtml.style.display = tab === 'html' ? 'block' : 'none';
            });
        });

        // ============ 2. 颜色格式转换 ============
        const hexInput = document.getElementById('color-hex');
        const rgbInput = document.getElementById('color-rgb');
        const hslInput = document.getElementById('color-hsl');
        const hsvInput = document.getElementById('color-hsv');
        const cmykInput = document.getElementById('color-cmyk');
        const preview = document.getElementById('color-preview');
        const historyList = document.getElementById('color-history-list');
        const colorPicker = document.getElementById('color-picker');

        const colorInputs = { hex: hexInput, rgb: rgbInput, hsl: hslInput, hsv: hsvInput, cmyk: cmykInput };

        // 颜色历史 (闭包数组, 最近 10 个)
        let colorHistory = [];
        const MAX_HISTORY = 10;

        // --- 基础辅助 ---
        function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

        // --- HEX ↔ RGB ---
        function hexToRgb(hex) {
            hex = String(hex).trim().replace(/^#/, '');
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            if (hex.length === 8) hex = hex.slice(0, 6); // 丢弃 alpha 通道
            if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
        function rgbToHex(r, g, b) {
            return '#' + [r, g, b].map(n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
        }

        // --- RGB 文本解析 ---
        function parseRgb(str) {
            const m = String(str).match(/(\d+\.?\d*)\s*[, ]\s*(\d+\.?\d*)\s*[, ]\s*(\d+\.?\d*)/);
            if (!m) return null;
            const r = +m[1], g = +m[2], b = +m[3];
            if ([r, g, b].some(n => isNaN(n) || n < 0 || n > 255)) return null;
            return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
        }

        // --- RGB ↔ HSL ---
        function rgbToHsl(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h = 0, s = 0; const l = (max + min) / 2;
            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
                else if (max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h /= 6;
            }
            return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
        }
        function hslToRgb(h, s, l) {
            h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
            let r, g, b;
            if (s === 0) { r = g = b = l; }
            else {
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1 / 6) return p + (q - p) * 6 * t;
                    if (t < 1 / 2) return q;
                    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                r = hue2rgb(p, q, h + 1 / 3);
                g = hue2rgb(p, q, h);
                b = hue2rgb(p, q, h - 1 / 3);
            }
            return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
        }
        function parseHsl(str) {
            const m = String(str).match(/(\d+\.?\d*)\s*[, ]\s*(\d+\.?\d*)\s*%?\s*[, ]\s*(\d+\.?\d*)\s*%?/);
            if (!m) return null;
            const h = +m[1], s = +m[2], l = +m[3];
            if ([h, s, l].some(n => isNaN(n))) return null;
            return hslToRgb(clamp(h, 0, 360), clamp(s, 0, 100), clamp(l, 0, 100));
        }

        // --- RGB ↔ HSV ---
        function rgbToHsv(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const d = max - min;
            let h = 0; const s = max === 0 ? 0 : d / max; const v = max;
            if (max !== min) {
                if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
                else if (max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h /= 6;
            }
            return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
        }
        function hsvToRgb(h, s, v) {
            h = (((h % 360) + 360) % 360) / 360; s /= 100; v /= 100;
            let r, g, b;
            const i = Math.floor(h * 6), f = h * 6 - i;
            const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
            switch (i % 6) {
                case 0: r = v; g = t; b = p; break;
                case 1: r = q; g = v; b = p; break;
                case 2: r = p; g = v; b = t; break;
                case 3: r = p; g = q; b = v; break;
                case 4: r = t; g = p; b = v; break;
                case 5: r = v; g = p; b = q; break;
            }
            return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
        }
        function parseHsv(str) {
            const m = String(str).match(/(\d+\.?\d*)\s*[, ]\s*(\d+\.?\d*)\s*%?\s*[, ]\s*(\d+\.?\d*)\s*%?/);
            if (!m) return null;
            const h = +m[1], s = +m[2], v = +m[3];
            if ([h, s, v].some(n => isNaN(n))) return null;
            return hsvToRgb(clamp(h, 0, 360), clamp(s, 0, 100), clamp(v, 0, 100));
        }

        // --- RGB ↔ CMYK ---
        function rgbToCmyk(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const k = 1 - Math.max(r, g, b);
            if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }; // 纯黑
            const c = (1 - r - k) / (1 - k);
            const m = (1 - g - k) / (1 - k);
            const y = (1 - b - k) / (1 - k);
            return { c: Math.round(c * 100), m: Math.round(m * 100), y: Math.round(y * 100), k: Math.round(k * 100) };
        }
        function cmykToRgb(c, m, y, k) {
            c /= 100; m /= 100; y /= 100; k /= 100;
            return {
                r: Math.round(255 * (1 - c) * (1 - k)),
                g: Math.round(255 * (1 - m) * (1 - k)),
                b: Math.round(255 * (1 - y) * (1 - k))
            };
        }
        function parseCmyk(str) {
            const m = String(str).match(/(\d+\.?\d*)\s*%?\s*[, ]\s*(\d+\.?\d*)\s*%?\s*[, ]\s*(\d+\.?\d*)\s*%?\s*[, ]\s*(\d+\.?\d*)\s*%?/);
            if (!m) return null;
            const c = +m[1], mm = +m[2], yy = +m[3], k = +m[4];
            if ([c, mm, yy, k].some(n => isNaN(n))) return null;
            return cmykToRgb(clamp(c, 0, 100), clamp(mm, 0, 100), clamp(yy, 0, 100), clamp(k, 0, 100));
        }

        // --- 格式化输出 ---
        function fmtHex(rgb) { return rgbToHex(rgb.r, rgb.g, rgb.b); }
        function fmtRgb(rgb) { return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`; }
        function fmtHsl(hsl) { return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`; }
        function fmtHsv(hsv) { return `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`; }
        function fmtCmyk(cmyk) { return `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`; }

        // 各输入对应解析器
        const parsers = {
            hex: hexToRgb,
            rgb: parseRgb,
            hsl: parseHsl,
            hsv: parseHsv,
            cmyk: parseCmyk
        };

        // 根据 source 输入解析出 RGB, 同步其余 4 个 + 预览 + (可选)历史
        function syncFrom(source, record) {
            const raw = colorInputs[source].value;
            const rgb = parsers[source](raw);
            if (!rgb) {
                // 输入无效: 仅标红当前输入与预览, 不破坏其他输入
                colorInputs[source].classList.add('invalid');
                preview.style.background = '#ef4444';
                preview.title = '输入无效';
                return;
            }
            colorInputs[source].classList.remove('invalid');
            // 更新其他 4 个输入
            Object.keys(colorInputs).forEach(key => {
                if (key === source) return;
                let val;
                if (key === 'hex') val = fmtHex(rgb);
                else if (key === 'rgb') val = fmtRgb(rgb);
                else if (key === 'hsl') val = fmtHsl(rgbToHsl(rgb.r, rgb.g, rgb.b));
                else if (key === 'hsv') val = fmtHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
                else if (key === 'cmyk') val = fmtCmyk(rgbToCmyk(rgb.r, rgb.g, rgb.b));
                colorInputs[key].value = val;
                colorInputs[key].classList.remove('invalid');
            });
            // 色块预览
            const hex = fmtHex(rgb);
            preview.style.background = hex;
            preview.title = hex;
            // 同步原生 color picker 的 value (必须小写 #RRGGBB)
            if (colorPicker) colorPicker.value = hex.toLowerCase();
            // 颜色历史 (去重连续相同, 仅在用户调整时记录)
            if (record) addHistory(hex);
        }

        // --- 颜色历史 ---
        function addHistory(hex) {
            if (colorHistory[0] === hex) return;
            colorHistory.unshift(hex);
            if (colorHistory.length > MAX_HISTORY) colorHistory.length = MAX_HISTORY;
            renderHistory();
        }
        function renderHistory() {
            if (!colorHistory.length) {
                historyList.innerHTML = '<span style="color: var(--text-dim); font-size: 0.85rem;">暂无历史, 修改任一颜色即可记录</span>';
                return;
            }
            historyList.innerHTML = colorHistory.map(hex =>
                `<div class="history-swatch" data-hex="${escapeHtml(hex)}" title="${escapeHtml(hex)}" style="background: ${escapeHtml(hex)};"></div>`
            ).join('');
        }
        // 点击历史色块恢复
        historyList.addEventListener('click', e => {
            const sw = e.target.closest('.history-swatch');
            if (!sw) return;
            const hex = sw.getAttribute('data-hex');
            hexInput.value = hex;
            syncFrom('hex', false);
        });

        // --- debounce 200ms 实时同步 ---
        function debounce(fn, ms) {
            let t;
            return function () {
                clearTimeout(t);
                t = setTimeout(fn, ms);
            };
        }
        Object.keys(colorInputs).forEach(key => {
            colorInputs[key].addEventListener('input', debounce(() => syncFrom(key, true), 200));
        });

        // 原生 color picker: 拖动选色时实时同步所有输入框 (input 事件连续触发)
        if (colorPicker) {
            colorPicker.addEventListener('input', debounce(() => {
                hexInput.value = colorPicker.value.toUpperCase();
                syncFrom('hex', true);
            }, 100));
        }

        // --- 复制按钮 ---
        function copyValue(value, btn, okText) {
            if (!value) return;
            window.electron.writeClipboard(value);
            const orig = btn.textContent;
            btn.textContent = okText;
            setTimeout(() => { btn.textContent = orig; }, 1200);
        }
        document.querySelectorAll('.color-copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-copy');
                copyValue(colorInputs[key].value, btn, '已复制');
            });
        });
        const btnCopyHex = document.getElementById('btn-copy-hex');
        btnCopyHex.addEventListener('click', () => copyValue(hexInput.value, btnCopyHex, '已复制！'));

        // 初始同步 (不记入历史)
        syncFrom('hex', false);

        // ============ 3. HTML 转义/反转义 Tab ============
        const htmlInput = document.getElementById('html-input');
        const htmlOutput = document.getElementById('html-output');
        const btnEscape = document.getElementById('btn-html-escape');
        const btnUnescape = document.getElementById('btn-html-unescape');
        const btnHtmlClear = document.getElementById('btn-html-clear');
        const btnHtmlCopy = document.getElementById('btn-html-copy');

        btnEscape.addEventListener('click', () => {
            htmlOutput.value = escapeHtml(htmlInput.value);
        });
        btnUnescape.addEventListener('click', () => {
            htmlOutput.value = unescapeHtml(htmlInput.value);
        });
        btnHtmlClear.addEventListener('click', () => {
            htmlInput.value = '';
            htmlOutput.value = '';
        });
        btnHtmlCopy.addEventListener('click', () => copyValue(htmlOutput.value, btnHtmlCopy, '已复制！'));
    }
};
