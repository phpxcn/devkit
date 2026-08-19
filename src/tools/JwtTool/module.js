module.exports = {
    init: function() {
        const jwtInput = document.getElementById('jwt-input');
        const btnParse = document.getElementById('btn-parse-jwt');
        const btnClear = document.getElementById('btn-clear-jwt');
        const btnCopyHeader = document.getElementById('btn-copy-header');
        const btnCopyPayload = document.getElementById('btn-copy-payload');
        const errorBox = document.getElementById('jwt-error');
        const headerPre = document.getElementById('jwt-header');
        const payloadPre = document.getElementById('jwt-payload');
        const signaturePre = document.getElementById('jwt-signature');
        const algBadge = document.getElementById('jwt-alg-badge');
        const expBadge = document.getElementById('jwt-exp-badge');
        const timeInfo = document.getElementById('jwt-time-info');

        // 缓存最近一次解析结果, 供"复制"按钮使用
        let lastHeader = '';
        let lastPayload = '';

        // --- 工具函数: HTML 转义 (XSS 防护) ---
        function escapeHtml(s) {
            if (s === null || s === undefined) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // --- base64url → UTF-8 字符串 ---
        // 1) '-' -> '+', '_' -> '/'
        // 2) 补齐 '=' padding
        // 3) atob 解码为二进制字符串, 再按 UTF-8 还原 (处理非 ASCII 字符)
        function base64UrlDecode(str) {
            let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
            const pad = s.length % 4;
            if (pad) s += '='.repeat(4 - pad);
            const binary = atob(s);
            const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        }

        // --- 秒级时间戳 → 本地可读时间字符串 ---
        function formatTimestamp(sec) {
            const n = Number(sec);
            if (!Number.isFinite(n)) return null;
            const d = new Date(n * 1000);
            if (isNaN(d.getTime())) return null;
            return d.toLocaleString();
        }

        // --- 核心: 解析 JWT ---
        function parseJwt(token) {
            const trimmed = (token || '').trim();
            if (!trimmed) return null;
            const parts = trimmed.split('.');
            if (parts.length !== 3) {
                throw new Error('JWT 格式错误: 应为 header.payload.signature 三段式结构 (当前共 ' + parts.length + ' 段)');
            }
            const [headerB64, payloadB64, signature] = parts;
            if (!headerB64 || !payloadB64 || !signature) {
                throw new Error('JWT 格式错误: 存在空段');
            }
            const headerJson = base64UrlDecode(headerB64);
            const payloadJson = base64UrlDecode(payloadB64);

            let headerObj, payloadObj;
            try {
                headerObj = JSON.parse(headerJson);
            } catch (e) {
                throw new Error('Header 段不是有效 JSON: ' + e.message);
            }
            try {
                payloadObj = JSON.parse(payloadJson);
            } catch (e) {
                throw new Error('Payload 段不是有效 JSON: ' + e.message);
            }
            return { headerObj, payloadObj, signature };
        }

        // --- 渲染结果 ---
        function renderResult(parsed) {
            if (!parsed) {
                headerPre.textContent = '等待解析...';
                headerPre.classList.add('empty-state');
                payloadPre.textContent = '等待解析...';
                payloadPre.classList.add('empty-state');
                signaturePre.textContent = '等待解析...';
                signaturePre.classList.add('empty-state');
                algBadge.innerHTML = '';
                algBadge.style.display = 'none';
                expBadge.innerHTML = '';
                expBadge.style.display = 'none';
                timeInfo.innerHTML = '';
                lastHeader = '';
                lastPayload = '';
                return;
            }

            const { headerObj, payloadObj, signature } = parsed;
            const isPlainObj = (payloadObj && typeof payloadObj === 'object' && !Array.isArray(payloadObj));

            // Header: JSON 美化 (用 textContent, 天然防 XSS)
            const headerStr = JSON.stringify(headerObj, null, 2);
            lastHeader = headerStr;
            headerPre.classList.remove('empty-state');
            headerPre.textContent = headerStr;

            // alg 标签
            const alg = headerObj && headerObj.alg;
            if (alg !== undefined && alg !== null && alg !== '') {
                algBadge.innerHTML = 'alg: ' + escapeHtml(alg);
                algBadge.className = 'jwt-badge';
            } else {
                algBadge.innerHTML = 'alg: 未指定';
                algBadge.className = 'jwt-badge badge-warn';
            }
            algBadge.style.display = '';

            // Payload: JSON 美化
            const payloadStr = JSON.stringify(payloadObj, null, 2);
            lastPayload = payloadStr;
            payloadPre.classList.remove('empty-state');
            payloadPre.textContent = payloadStr;

            // 过期判断
            const nowSec = Math.floor(Date.now() / 1000);
            let hasExp = false, expired = false;
            if (isPlainObj && typeof payloadObj.exp === 'number' && Number.isFinite(payloadObj.exp)) {
                hasExp = true;
                expired = nowSec > payloadObj.exp;
            }

            // exp 标签 (红=已过期 / 绿=有效 / 黄=无 exp)
            if (hasExp) {
                expBadge.innerHTML = expired ? '已过期' : '有效';
                expBadge.className = 'jwt-badge ' + (expired ? 'badge-danger' : 'badge-success');
            } else {
                expBadge.innerHTML = '无 exp';
                expBadge.className = 'jwt-badge badge-warn';
            }
            expBadge.style.display = '';

            // 时间字段解析提示 (iat / exp / nbf)
            const timeFields = ['iat', 'exp', 'nbf'];
            const rows = [];
            if (isPlainObj) {
                timeFields.forEach(k => {
                    if (!(k in payloadObj)) return;
                    const v = payloadObj[k];
                    const readable = formatTimestamp(v);
                    let extra = '';
                    if (k === 'exp' && hasExp) extra = expired ? ' (已过期)' : ' (有效)';
                    if (readable) {
                        rows.push('<div class="jwt-time-row">' +
                            '<span class="jwt-time-key">' + escapeHtml(k) + '</span>' +
                            '<span class="jwt-time-val">' + escapeHtml(readable) + escapeHtml(extra) + '</span>' +
                            '</div>');
                    } else {
                        rows.push('<div class="jwt-time-row">' +
                            '<span class="jwt-time-key">' + escapeHtml(k) + '</span>' +
                            '<span class="jwt-time-val">' + escapeHtml(v) + ' (非有效时间戳)</span>' +
                            '</div>');
                    }
                });
            }
            timeInfo.innerHTML = rows.length ? rows.join('') : '';

            // Signature: 原始 base64url 字符串, 不解码
            signaturePre.classList.remove('empty-state');
            signaturePre.textContent = signature;
        }

        // --- 显示/隐藏错误 ---
        function renderError(message) {
            if (!message) {
                errorBox.style.display = 'none';
                errorBox.innerHTML = '';
                return;
            }
            errorBox.innerHTML = escapeHtml(message);
            errorBox.style.display = '';
        }

        // --- 执行解析 (带错误处理) ---
        function doParse() {
            const token = jwtInput.value;
            if (!token || !token.trim()) {
                renderResult(null);
                renderError(null);
                return;
            }
            try {
                const parsed = parseJwt(token);
                renderResult(parsed);
                renderError(null);
            } catch (e) {
                // 解析失败: 显示错误并清空结果区, 避免与输入不一致
                renderResult(null);
                renderError(e.message);
            }
        }

        // --- 按钮闪现反馈 (与 TableTool 一致) ---
        function flashButton(btn) {
            const old = btn.textContent;
            btn.textContent = '已拷贝!';
            setTimeout(() => { btn.textContent = old; }, 2000);
        }

        // --- 事件绑定 ---
        btnParse?.addEventListener('click', () => {
            doParse();
        });

        btnClear?.addEventListener('click', () => {
            jwtInput.value = '';
            renderResult(null);
            renderError(null);
            jwtInput.focus();
        });

        btnCopyHeader?.addEventListener('click', async () => {
            if (!lastHeader) return;
            const ok = await window.copyToClipboard(lastHeader);
            if (ok) flashButton(btnCopyHeader);
        });

        btnCopyPayload?.addEventListener('click', async () => {
            if (!lastPayload) return;
            const ok = await window.copyToClipboard(lastPayload);
            if (ok) flashButton(btnCopyPayload);
        });

        // 输入变化时 debounce 300ms 自动解析
        let debounceTimer;
        jwtInput?.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                doParse();
            }, 300);
        });

        // 初始空状态
        renderResult(null);
        renderError(null);
    }
};
