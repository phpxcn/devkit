/**
 * JSONTreeView - 支持虚拟滚动的高性能 JSON 树形视图
 * 通过虚拟化渲染，无论 JSON 有多大，始终只渲染视口可见行
 */
class JSONTreeView {
    constructor(container) {
        this.container = container;
        this.data = null;
        this.flatRows = [];      // 扁平化的全部可见行
        this.ROW_HEIGHT = 24;    // 每行固定高度 (px)
        this.BUFFER = 40;        // 视口外缓冲行数，防止滚动白屏
        this.clickHandler = null;
        this.scrollHandler = null;
        this._viewport = null;
        this._track = null;
    }

    /**
     * 渲染入口
     */
    render(obj, path = '$') {
        if (obj === undefined) {
            this.container.innerHTML = `<div style="color: #64748b; padding: 20px;">等待数据录入...</div>`;
            return;
        }
        try {
            this.data = this.buildTreeNode(obj, path, 0);
            this.flatRows = this.flattenTree(this.data);
            this.setupVirtualScroll();
        } catch (err) {
            this.container.innerHTML = `<div style="color: #ef4444; padding: 20px;">渲染失败: ${err.message}</div>`;
        }
    }

    /**
     * 构建树节点
     */
    buildTreeNode(obj, path, depth) {
        if (depth > 100) {
            return {
                path, type: 'string', key: '...', value: '[嵌套过深，已截断]',
                children: [], expanded: false, count: 0
            };
        }
        const type = Array.isArray(obj) ? 'array' : (obj === null ? 'null' : typeof obj);
        const isArray = type === 'array';
        const isObject = type === 'object';
        const children = [];

        if (isArray) {
            for (let i = 0; i < obj.length; i++) {
                children.push(this.buildTreeNode(obj[i], `${path}[${i}]`, depth + 1));
            }
        } else if (isObject) {
            const keys = Object.keys(obj);
            for (let i = 0; i < keys.length; i++) {
                children.push(this.buildTreeNode(obj[keys[i]], `${path}.${keys[i]}`, depth + 1));
            }
        }

        const key = path.split(/[\.\[]/).pop().replace(']', '') || '$';
        return {
            path,
            type,
            key,
            value: (isObject || isArray) ? undefined : obj,
            count: children.length,
            children,
            expanded: depth < 2, // 默认展开前 2 层，避免大数据一次撑爆
        };
    }

    /**
     * 将树形结构扁平化为可见行列表（根据 expanded 状态）
     */
    flattenTree(root) {
        const rows = [];
        const walk = (node, level, isLast) => {
            const isComplex = (node.type === 'object' || node.type === 'array');
            const hasChildren = node.children.length > 0;
            // 推入节点行
            rows.push({ node, level, isLast, isClose: false });
            // 如果展开，递归添加子行
            if (isComplex && hasChildren && node.expanded) {
                for (let i = 0; i < node.children.length; i++) {
                    walk(node.children[i], level + 1, i === node.children.length - 1);
                }
                // 推入闭合括号行
                rows.push({ node, level, isLast, isClose: true });
            }
        };
        walk(root, 0, true);
        return rows;
    }

    /**
     * 创建虚拟滚动骨架
     */
    setupVirtualScroll() {
        const totalHeight = this.flatRows.length * this.ROW_HEIGHT;

        this.container.innerHTML = `
            <div class="json-vscroll-track" style="height: ${totalHeight}px; position: relative;">
                <div class="json-vscroll-viewport" style="position: absolute; left: 0; right: 0; top: 0;"></div>
            </div>
        `;
        this._track = this.container.querySelector('.json-vscroll-track');
        this._viewport = this.container.querySelector('.json-vscroll-viewport');

        this.bindEvents();
        this.renderVisibleRows();
    }

    /**
     * 计算并渲染可见行
     */
    renderVisibleRows() {
        if (!this._viewport) return;
        const containerH = this.container.clientHeight || 600;
        const scrollTop = this.container.scrollTop;

        const startIdx = Math.max(0, Math.floor(scrollTop / this.ROW_HEIGHT) - this.BUFFER);
        const endIdx = Math.min(
            this.flatRows.length - 1,
            Math.ceil((scrollTop + containerH) / this.ROW_HEIGHT) + this.BUFFER
        );

        this._viewport.style.top = `${startIdx * this.ROW_HEIGHT}px`;

        let html = '';
        for (let i = startIdx; i <= endIdx; i++) {
            html += this.renderRow(this.flatRows[i]);
        }
        this._viewport.innerHTML = html;
    }

    /**
     * 渲染单行 HTML
     */
    renderRow(rowData) {
        const { node, level, isLast, isClose } = rowData;
        const indent = level * 20;
        const H = this.ROW_HEIGHT;

        // 闭合括号行
        if (isClose) {
            const cb = node.type === 'array' ? ']' : '}';
            return `<div class="line-row-close" style="height:${H}px;display:flex;align-items:center;padding-left:${indent + 24}px;white-space:nowrap;">
                <span class="token-bracket">${cb}</span>${isLast ? '' : '<span class="token-comma">,</span>'}
            </div>`;
        }

        const isComplex = (node.type === 'object' || node.type === 'array');
        const hasChildren = node.children.length > 0;
        const ob = node.type === 'array' ? '[' : '{';
        const cb = node.type === 'array' ? ']' : '}';
        const countLabel = node.type === 'array' ? '项' : '个属性';

        let html = `<div class="line-row" style="height:${H}px;display:flex;align-items:center;white-space:nowrap;padding-left:${indent}px;">`;

        // 展开/收起图标
        if (isComplex && hasChildren) {
            html += `<span class="toggle-icon ${node.expanded ? 'expanded' : ''}" data-path="${node.path}">▼</span>`;
        } else {
            html += `<span class="toggle-spacer"></span>`;
        }

        // 键名（针对对象属性）
        if (node.path !== '$' && !node.path.endsWith(']')) {
            html += `<span class="token-key">"${this.escapeHtml(node.key)}"</span><span class="token-colon">: </span>`;
        }

        // 值
        if (isComplex) {
            html += `<span class="token-bracket">${ob}</span>`;
            if (hasChildren) {
                if (node.expanded) {
                    html += `<span class="token-comment"> // ${node.count} ${countLabel}</span>`;
                } else {
                    html += `<span class="ellipses" data-path="${node.path}"> ... </span>`;
                    html += `<span class="token-bracket">${cb}</span>`;
                    if (!isLast) html += '<span class="token-comma">,</span>';
                    html += `<span class="token-comment"> // ${node.count} ${countLabel}</span>`;
                }
            } else {
                html += `<span class="token-bracket">${cb}</span>`;
                if (!isLast) html += '<span class="token-comma">,</span>';
            }
        } else {
            let valClass = `token-${node.type}`;
            let displayVal;
            if (node.type === 'string') {
                const maxLen = 300;
                const raw = node.value;
                const truncated = raw.length > maxLen ? raw.substring(0, maxLen) + '…' : raw;
                displayVal = `"${this.escapeHtml(truncated)}"`;
            } else if (node.type === 'null') {
                displayVal = 'null';
            } else {
                displayVal = this.escapeHtml(String(node.value));
            }
            html += `<span class="${valClass}">${displayVal}</span>`;
            if (!isLast) html += '<span class="token-comma">,</span>';
        }

        html += `</div>`;
        return html;
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 绑定事件（滚动 + 点击委托）
     */
    bindEvents() {
        if (this.scrollHandler) {
            this.container.removeEventListener('scroll', this.scrollHandler);
        }
        this.scrollHandler = () => this.renderVisibleRows();
        this.container.addEventListener('scroll', this.scrollHandler, { passive: true });

        if (this.clickHandler) {
            this.container.removeEventListener('click', this.clickHandler);
        }
        this.clickHandler = (e) => {
            const t = e.target;
            if (t.classList.contains('toggle-icon') || t.classList.contains('ellipses')) {
                const path = t.dataset.path;
                if (path) this.toggleNode(path);
            }
        };
        this.container.addEventListener('click', this.clickHandler);
    }

    /**
     * 切换节点展开/收起，并刷新扁平行列表
     */
    toggleNode(path) {
        const findAndToggle = (node) => {
            if (node.path === path) {
                node.expanded = !node.expanded;
                return true;
            }
            for (const child of node.children) {
                if (findAndToggle(child)) return true;
            }
            return false;
        };
        if (findAndToggle(this.data)) {
            this._refreshFlatRows();
        }
    }

    /** 全部收起（仅保留根节点展开） */
    collapseAll() {
        if (!this.data) return;
        const collapse = (node) => {
            node.expanded = false;
            node.children.forEach(collapse);
        };
        collapse(this.data);
        this.data.expanded = true;
        this._refreshFlatRows();
    }

    /** 全部展开（最多展开 6 层，防止大数据 OOM） */
    expandAll() {
        if (!this.data) return;
        const expand = (node, depth) => {
            node.expanded = depth < 6;
            if (node.expanded) node.children.forEach(c => expand(c, depth + 1));
        };
        expand(this.data, 0);
        this._refreshFlatRows();
    }

    /** 刷新扁平行列表并更新虚拟滚动高度 */
    _refreshFlatRows() {
        this.flatRows = this.flattenTree(this.data);
        if (this._track) {
            this._track.style.height = `${this.flatRows.length * this.ROW_HEIGHT}px`;
        }
        this.renderVisibleRows();
    }

    /** 返回当前可见行数（供外部统计） */
    get rowCount() {
        return this.flatRows.length;
    }
}

if (typeof module !== 'undefined') {
    module.exports = JSONTreeView;
}
