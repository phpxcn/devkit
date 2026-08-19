const TimestampTool = require('./core');

module.exports = {
    init: function() {
        const tsTool = new TimestampTool();
        const liveTsS = document.getElementById('live-ts-s');
        const liveTsMs = document.getElementById('live-ts-ms');
        const liveLocalClock = document.getElementById('live-local-clock');
        const tsInput = document.getElementById('ts-input');
        const btnConvertTs = document.getElementById('btn-convert-ts');

        // 定时更新当前时间戳
        const timer = setInterval(() => {
            const now = new Date();
            if (liveTsS) liveTsS.textContent = Math.floor(now.getTime() / 1000);
            if (liveTsMs) liveTsMs.textContent = '.' + (now.getTime() % 1000).toString().padStart(3, '0');
            if (liveLocalClock) liveLocalClock.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
        }, 100);

        // 绑定转换按钮
        btnConvertTs?.addEventListener('click', () => {
            const val = tsInput.value.trim();
            if (!val) return;
            try {
                const res = tsTool.convert(val);
                document.getElementById('res-ts-s').textContent = res.seconds;
                document.getElementById('res-ts-ms').textContent = res.timestamp;
                document.getElementById('res-iso').textContent = res.iso;
                document.getElementById('res-local').textContent = res.local;
                document.getElementById('res-utc').textContent = 'UTC: ' + res.utc;
                document.getElementById('res-type').textContent = res.type;
            } catch (e) { alert(e.message); }
        });

        // 回车支持
        tsInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnConvertTs.click(); });

        // 统一拷贝功能
        document.querySelectorAll('.copy-ts-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetId = btn.getAttribute('data-target');
                const text = document.getElementById(targetId)?.textContent;
                if (text && text !== '-') {
                    const success = await window.copyToClipboard(text);
                    if (success) {
                        const originalText = btn.textContent;
                        btn.textContent = '✅';
                        setTimeout(() => btn.textContent = originalText, 1000);
                    }
                }
            });
        });

        // 清理定时器
        window.onToolUnload = () => clearInterval(timer);
    }
};
