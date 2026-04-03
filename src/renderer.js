/**
 * 开发者工具箱 - 模块化加载器
 * 负责动态切换工具视图与资源管理
 */
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

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
    'settings-tool': {
        name: '系统设置',
        view: './src/tools/SettingsTool/view.html',
        module: './src/tools/SettingsTool/module.js'
    }
};

// --- 初始化：应用持久化设置 ---
try {
    const settingsMod = require('./tools/SettingsTool/module');
    if (settingsMod.applySavedSettings) settingsMod.applySavedSettings();
} catch (e) {
    console.warn('Initial settings apply failed:', e);
}

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
        const html = fs.readFileSync(path.join(process.cwd(), config.view), 'utf8');
        activeContent.innerHTML = html;

        // C. 更新 UI 状态
        pageTitleElem.textContent = config.name;
        navItems.forEach(ni => {
            ni.classList.toggle('active', ni.dataset.page === toolId);
        });

        // D. 加载并运行 JS 逻辑 (强制清除 Require 缓存以保证重新初始化)
        const modulePath = path.resolve(process.cwd(), config.module);
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
