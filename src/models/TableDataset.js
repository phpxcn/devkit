/**
 * 开发者工具箱 - 统一表格数据模型
 * 负责核心数据的存储、转换逻辑及撤销/重做状态管理
 */
class TableDataset {
    constructor() {
        this.headers = ['A', 'B', 'C'];
        this.rows = [['', '', ''], ['', '', ''], ['', '', '']];
        
        this.metadata = {
            rowCount: 3,
            colCount: 3,
            createdAt: Date.now()
        };
        
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        // 初始化存入第一帧
        this.saveToHistory();
    }
    
    saveToHistory() {
        const snapshot = {
            headers: JSON.parse(JSON.stringify(this.headers)),
            rows: JSON.parse(JSON.stringify(this.rows))
        };
        
        // 关键逻辑：身份校验，防止“点两次”Bug
        if (this.historyIndex >= 0) {
            const last = this.history[this.historyIndex];
            if (JSON.stringify(last.headers) === JSON.stringify(snapshot.headers) &&
                JSON.stringify(last.rows) === JSON.stringify(snapshot.rows)) {
                return; // 内容高度一致，拒绝浪费存储
            }
        }

        // 如果在历史中间分支做了新改动，切断未来的“红线”分支
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        this.history.push(snapshot);
        this.historyIndex = this.history.length - 1;
        
        if (this.history.length > this.maxHistory) {
            this.history.shift();
            this.historyIndex--;
        }
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const snapshot = this.history[this.historyIndex];
            this.headers = JSON.parse(JSON.stringify(snapshot.headers));
            this.rows = JSON.parse(JSON.stringify(snapshot.rows));
            this.updateMetadata();
            return true;
        }
        return false;
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const snapshot = this.history[this.historyIndex];
            this.headers = JSON.parse(JSON.stringify(snapshot.headers));
            this.rows = JSON.parse(JSON.stringify(snapshot.rows));
            this.updateMetadata();
            return true;
        }
        return false;
    }
    
    transpose() {
        const matrix = [this.headers, ...this.rows];
        const transposed = matrix[0].map((_, colIndex) => 
            matrix.map(row => row[colIndex] || '')
        );
        
        if (transposed.length > 0) {
            this.headers = transposed[0];
            this.rows = transposed.slice(1);
        }
        this.updateMetadata();
        this.saveToHistory(); // 变更后存入
    }
    
    removeDuplicates() {
        const seen = new Set();
        this.rows = this.rows.filter(row => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        this.updateMetadata();
        this.saveToHistory(); // 变更后存入
    }

    clear() {
        this.headers = ['A', 'B', 'C'];
        this.rows = [['', '', ''], ['', '', ''], ['', '', '']];
        this.updateMetadata();
        this.saveToHistory();
    }
    
    updateMetadata() {
        this.metadata.rowCount = this.rows.length;
        this.metadata.colCount = this.headers.length;
    }

    toMatrix(includeHeaders = true) {
        if (includeHeaders && this.headers.length) {
            return [this.headers, ...this.rows];
        }
        return this.rows;
    }

    fromMatrix(matrix, hasHeaders = true) {
        if (!matrix || matrix.length === 0) return;
        
        // 关键逻辑：导入新表意味着新项目的开始，重置并清空旧历史
        this.history = [];
        this.historyIndex = -1;
        
        if (hasHeaders) {
            this.headers = matrix[0].map(h => h || '');
            this.rows = matrix.slice(1);
        } else {
            this.headers = Array(matrix[0]?.length || 0).fill('');
            this.rows = matrix;
        }
        this.updateMetadata();
        this.saveToHistory(); // 此时存入的是第 0 张快照
    }
}

// 导出为模块
if (typeof module !== 'undefined') {
    module.exports = TableDataset;
}
