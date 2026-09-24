/**
 * 开发者工具箱 - 模块化加载器
 * 负责动态切换工具视图与资源管理
 */
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// --- 侧边栏展开/收起功能 ---
(function initSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (!sidebar || !toggleBtn) return;

    function applyCollapsedState(collapsed) {
        const label = collapsed
            ? (toggleBtn.dataset.labelClose || '展开侧栏')
            : (toggleBtn.dataset.labelOpen  || '收起侧栏');
        toggleBtn.setAttribute('title', label);
        toggleBtn.setAttribute('aria-label', label);
    }

    // 默认收起
    const savedState = localStorage.getItem('devkit-sidebar-collapsed');
    const isCollapsed = savedState !== null ? savedState === 'true' : true;

    if (isCollapsed) sidebar.classList.add('collapsed');
    applyCollapsedState(isCollapsed);

    toggleBtn.addEventListener('click', () => {
        const nowCollapsed = sidebar.classList.toggle('collapsed');
        localStorage.setItem('devkit-sidebar-collapsed', nowCollapsed);
        applyCollapsedState(nowCollapsed);
    });
})();

// --- 侧栏收起态下的悬浮提示：只显示图标时也能认出功能 ---
(function initCollapsedTooltips() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    let tip = null;
    function ensureTip() {
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'sidebar-tooltip';
            document.body.appendChild(tip);
        }
        return tip;
    }

    // 名称直接取菜单项里的文字，无需重复维护
    function labelOf(item) {
        const span = item.querySelector('span:not(.nav-icon)');
        return (span ? span.textContent : '').trim();
    }

    function show(item) {
        const t = ensureTip();
        t.textContent = labelOf(item);
        const rect = item.getBoundingClientRect();
        t.style.top = (rect.top + rect.height / 2) + 'px';
        t.style.left = (rect.right + 10) + 'px';
        t.classList.add('visible');
    }

    function hide() {
        if (tip) tip.classList.remove('visible');
    }

    sidebar.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            if (sidebar.classList.contains('collapsed')) show(item);
        });
        item.addEventListener('mouseleave', hide);
        item.addEventListener('click', hide);
    });

    sidebar.addEventListener('mouseleave', hide);
    const nav = sidebar.querySelector('nav');
    if (nav) nav.addEventListener('scroll', hide);
})();

// 1. 全局辅助工具 (挂载到 window 供各模块使用)
window.copyToClipboard = async function(text) {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {
        console.error('Clipboard failed:', e);
    }
    return false;
};

// 2. 模块注册表
const ToolRegistry = {
    'json-tool': {
        name: 'JSON 格式化',
        view: './src/tools/JsonTool/view.html',
        module: './src/tools/JsonTool/module.js'
    },
    'json-diff-tool': {
        name: 'JSON 对比',
        view: './src/tools/JsonDiffTool/view.html',
        module: './src/tools/JsonDiffTool/module.js'
    },
    'text-diff-tool': {
        name: '文本对比',
        view: './src/tools/TextDiffTool/view.html',
        module: './src/tools/TextDiffTool/module.js'
    },
    'password-tool': {
        name: '随机密码生成',
        view: './src/tools/PasswordTool/view.html',
        module: './src/tools/PasswordTool/module.js'
    },
    'crypto-tool': {
        name: '加解密工具',
        view: './src/tools/CryptoTool/view.html',
        module: './src/tools/CryptoTool/module.js'
    },
    'table-tool': {
        name: '表格转换',
        view: './src/tools/TableTool/view.html',
        module: './src/tools/TableTool/module.js'
    },
    'timestamp-tool': {
        name: '时间戳转换',
        view: './src/tools/TimestampTool/view.html',
        module: './src/tools/TimestampTool/module.js'
    },
    'jwt-tool': {
        name: 'JWT 解析',
        view: './src/tools/JwtTool/view.html',
        module: './src/tools/JwtTool/module.js'
    },
    'regex-tool': {
        name: '正则表达式测试',
        view: './src/tools/RegexTool/view.html',
        module: './src/tools/RegexTool/module.js'
    },
    'numeric-tool': {
        name: '数字工具集',
        view: './src/tools/NumericTool/view.html',
        module: './src/tools/NumericTool/module.js'
    },
    'frontend-tool': {
        name: '前端小工具集',
        view: './src/tools/FrontendTool/view.html',
        module: './src/tools/FrontendTool/module.js'
    },
    'cron-tool': {
        name: 'Cron 表达式解析',
        view: './src/tools/CronTool/view.html',
        module: './src/tools/CronTool/module.js'
    },
    'markdown-pdf-tool': {
        name: 'Markdown 转 PDF',
        view: './src/tools/MarkdownPdfTool/view.html',
        module: './src/tools/MarkdownPdfTool/module.js'
    },
    'settings-tool': {
        name: '系统设置',
        view: './src/tools/SettingsTool/view.html',
        module: './src/tools/SettingsTool/module.js'
    }
};

// --- 初始化：应用持久化设置 ---
// (已移动到 index.html 内联脚本以获得更快的预加载体验)


const activeContent = document.getElementById('active-tool-content');
const pageTitleElem = document.getElementById('page-title');
const navItems = document.querySelectorAll('.nav-item');

// 3. 动态加载引擎
async function loadTool(toolId) {
    const config = ToolRegistry[toolId];
    if (!config) return;

    // A. 卸载旧模块 (清理定时器等)
    if (window.onToolUnload) {
        window.onToolUnload();
        window.onToolUnload = null;
    }

    try {
        // B. 加载 HTML 视图
        const html = fs.readFileSync(path.join(__dirname, config.view), 'utf8');
        activeContent.innerHTML = html;

        // B2. 动态分离加载 CSS
        let styleLink = document.getElementById('dynamic-tool-style');
        if (!styleLink) {
            styleLink = document.createElement('link');
            styleLink.id = 'dynamic-tool-style';
            styleLink.rel = 'stylesheet';
            document.head.appendChild(styleLink);
        }
        
        // 视图文件相同目录下的 style.css
        const cssRelativePath = path.dirname(config.view) + '/style.css';
        const cssAbsolutePath = path.join(__dirname, cssRelativePath);
        if (fs.existsSync(cssAbsolutePath)) {
            styleLink.href = cssRelativePath + "?v=" + Date.now(); // 附加时间戳防缓存
        } else {
            styleLink.removeAttribute('href');
        }

        // C. 更新 UI 状态
        pageTitleElem.textContent = config.name;
        navItems.forEach(ni => {
            ni.classList.toggle('active', ni.dataset.page === toolId);
        });

        // D. 加载并运行 JS 逻辑 (强制清除 Require 缓存以保证重新初始化)
        const modulePath = path.resolve(__dirname, config.module);
        delete require.cache[require.resolve(modulePath)];
        const toolModule = require(modulePath);
        
        if (toolModule && typeof toolModule.init === 'function') {
            toolModule.init();
        }
    } catch (err) {
        console.error(`Failed to load tool ${toolId}:`, err);
        activeContent.innerHTML = `<div class="empty-state" style="color:var(--danger)">加载模组失败: ${err.message}</div>`;
    }
}

// 4. 绑定导航事件
navItems.forEach(item => {
    item.addEventListener('click', () => {
        loadTool(item.dataset.page);
    });
});

// --- 5. 监听原生系统菜单命令 ---
ipcRenderer.on('open-settings', () => {
    loadTool('settings-tool');
});

// 6. 初始化：载入默认页面 (通常是第一个)
const initialPage = document.querySelector('.nav-item.active')?.dataset.page || 'json-tool';
loadTool(initialPage);

console.log('Modular Tool Loader Dynamicized.');
