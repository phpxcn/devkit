const CryptoJS = require('crypto-js');

module.exports = {
    init: function() {
        const tabs = document.querySelectorAll('.crypto-tabs button');
        const btnEncrypt = document.getElementById('btn-encrypt');
        const btnDecrypt = document.getElementById('btn-decrypt');
        const btnClear = document.getElementById('btn-clear-crypto');
        const btnCopy = document.getElementById('btn-copy-crypto');
        
        const inputElem = document.getElementById('crypto-input');
        const keyElem = document.getElementById('crypto-key');
        const outputElem = document.getElementById('crypto-output');
        const configKeyArea = document.getElementById('crypto-config-key');
        
        let activeType = 'AES';

        // --- 1. 算法切换逻辑 ---
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeType = tab.getAttribute('data-type');
                
                // 部分算法不需要密钥
                const noKeyAlgs = ['MD5', 'SHA256', 'Base64', 'URL'];
                configKeyArea.style.display = noKeyAlgs.includes(activeType) ? 'none' : 'block';
                
                // HASH 算法只有“加密”（生成哈希）
                btnDecrypt.style.display = ['MD5', 'SHA256'].includes(activeType) ? 'none' : 'block';
                
                // 更新提示词
                inputElem.placeholder = `请输入待${['MD5', 'SHA256'].includes(activeType) ? '哈希' : '处理'}的内容...`;
                
                // 每次切换重置状态
                // outputElem.value = '';
            });
        });

        // --- 2. 核心加解密函数 ---
        function perform(mode) {
            const data = inputElem.value.trim();
            const key = keyElem.value.trim();
            
            if (!data) return;
            
            try {
                let result = '';
                
                switch(activeType) {
                    case 'AES':
                        if (mode === 'enc') result = CryptoJS.AES.encrypt(data, key).toString();
                        else result = CryptoJS.AES.decrypt(data, key).toString(CryptoJS.enc.Utf8);
                        break;
                    case 'DES':
                        if (mode === 'enc') result = CryptoJS.DES.encrypt(data, key).toString();
                        else result = CryptoJS.DES.decrypt(data, key).toString(CryptoJS.enc.Utf8);
                        break;
                    case 'RC4':
                        if (mode === 'enc') result = CryptoJS.RC4.encrypt(data, key).toString();
                        else result = CryptoJS.RC4.decrypt(data, key).toString(CryptoJS.enc.Utf8);
                        break;
                    case 'TripleDES':
                        if (mode === 'enc') result = CryptoJS.TripleDES.encrypt(data, key).toString();
                        else result = CryptoJS.TripleDES.decrypt(data, key).toString(CryptoJS.enc.Utf8);
                        break;
                    case 'Rabbit':
                        if (mode === 'enc') result = CryptoJS.Rabbit.encrypt(data, key).toString();
                        else result = CryptoJS.Rabbit.decrypt(data, key).toString(CryptoJS.enc.Utf8);
                        break;
                    case 'MD5':
                        result = CryptoJS.MD5(data).toString();
                        break;
                    case 'SHA256':
                        result = CryptoJS.SHA256(data).toString();
                        break;
                    case 'Base64':
                        if (mode === 'enc') result = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(data));
                        else result = CryptoJS.enc.Base64.parse(data).toString(CryptoJS.enc.Utf8);
                        break;
                    case 'URL':
                        if (mode === 'enc') result = encodeURIComponent(data);
                        else result = decodeURIComponent(data);
                        break;
                }

                if (!result && mode === 'dec') throw new Error('解密失败，请检查密钥或原文是否匹配');
                outputElem.value = result;
            } catch (e) {
                alert('处理过程出错：' + e.message);
                console.error(e);
            }
        }

        // --- 3. 事件驱动 ---
        btnEncrypt?.addEventListener('click', () => perform('enc'));
        btnDecrypt?.addEventListener('click', () => perform('dec'));
        
        btnClear?.addEventListener('click', () => {
            inputElem.value = '';
            outputElem.value = '';
            keyElem.value = '';
        });

        btnCopy?.addEventListener('click', () => {
            if (!outputElem.value) return;
            window.electron.writeClipboard(outputElem.value);
            const originalText = btnCopy.textContent;
            btnCopy.textContent = '已复制！';
            setTimeout(() => { btnCopy.textContent = originalText; }, 1200);
        });
    }
};
