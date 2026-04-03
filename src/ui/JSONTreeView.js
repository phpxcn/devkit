/**
 * 统合后的富文本 JSON 树形编辑器
 * 真正将“代码高亮”、“折叠”和“结构”合而为一
 */
class JSONTreeView {
    constructor(container, onUpdate) {
        this.container = container;
        this.data = null;
        this.onUpdate = onUpdate; // 数据变更回调
    }
    
    /**
     * 将对象渲染为带高亮的富文本代码树
     */
    render(obj, path = '$') {
        if (obj === undefined) {
             this.container.innerHTML = `<div style="color: #64748b;">等待数据录入...</div>`;
             return;
        }
        
        // 渲染前预处理：记录折叠状态 (如果之前存在，可以尝试保留，此处演示全展开)
        this.data = this.buildTreeNode(obj, path);
        this.updateView();
    }

    updateView() {
        this.container.innerHTML = `<div class="json-rich-viewer">${this.renderNode(this.data)}</div>`;
        this.bindEvents();
    }
    
    buildTreeNode(obj, path) {
        const type = Array.isArray(obj) ? 'array' : typeof obj;
        const isObject = type === 'object' && obj !== null;
        let children = [];
        
        if (Array.isArray(obj)) {
            children = obj.map((item, idx) => this.buildTreeNode(item, `${path}[${idx}]`));
        } else if (isObject) {
            children = Object.keys(obj).map(key => this.buildTreeNode(obj[key], `${path}.${key}`));
        }
        
        return {
            path: path,
            type: type,
            key: path.split(/[\.\[]/).pop().replace(']', '') || 'root',
            value: isObject || Array.isArray(obj) ? undefined : obj,
            count: children.length, // 记录子元素数量
            children: children,
            expanded: true
        };
    }
    
    renderNode(node, level = 0, isLast = true) {
        const indent = level * 20;
        const isComplex = node.children && node.children.length > 0;
        const openBrace = node.type === 'array' ? '[' : '{';
        const closeBrace = node.type === 'array' ? ']' : '}';
        const countLabel = node.type === 'array' ? '项' : '个属性';
        
        let html = `<div class="line-row" style="padding-left: ${indent}px">`;
        
        if (isComplex) {
            html += `<span class="toggle-icon ${node.expanded ? 'expanded' : ''}" data-path="${node.path}">▼</span>`;
        } else {
            html += `<span class="toggle-spacer"></span>`;
        }
        
        if (node.path !== '$' && !node.path.endsWith(']')) {
            html += `<span class="token-key">"${node.key}"</span><span class="token-colon">: </span>`;
        }
        
        if (isComplex) {
            html += `<span class="token-bracket">${openBrace}</span>`;
            // 实时注入层级统计
            html += `<span class="token-comment"> // ${node.count} ${countLabel}</span>`;
            
            if (!node.expanded) {
                html += `<span class="ellipses" data-path="${node.path}"> ... </span>`;
                html += `<span class="token-bracket">${closeBrace}</span>${isLast ? '' : ','}`;
            }
        } else {
            const valClass = `token-${typeof node.value}`;
            const displayVal = typeof node.value === 'string' ? `"${node.value}"` : node.value;
            html += `<span class="${valClass}">${displayVal}</span>${isLast ? '' : '<span class="token-comma">,</span>'}`;
        }
        
        html += `</div>`;
        
        // 4. 子元素递归
        if (isComplex && node.expanded) {
            node.children.forEach((child, idx) => {
                html += this.renderNode(child, level + 1, idx === node.children.length - 1);
            });
            
            // 5. 闭合括号行 (对齐开启括号)
            html += `<div class="line-row-close" style="padding-left: ${indent + 15}px;">
                        <span class="token-bracket">${closeBrace}</span>${isLast ? '' : '<span class="token-comma">,</span>'}
                     </div>`;
        }
        
        return html;
    }
    
    bindEvents() {
        this.container.querySelectorAll('.toggle-icon, .ellipses').forEach(el => {
            el.onclick = (e) => {
                const path = el.dataset.path;
                this.toggleNode(path);
            };
        });
    }
    
    toggleNode(path) {
        const findAndToggle = (node) => {
            if (node.path === path) {
                node.expanded = !node.expanded;
                return true;
            }
            if (node.children) {
                for (let child of node.children) {
                    if (findAndToggle(child)) return true;
                }
            }
            return false;
        };
        if (findAndToggle(this.data)) this.updateView();
    }
}

if (typeof module !== 'undefined') {
    module.exports = JSONTreeView;
}
