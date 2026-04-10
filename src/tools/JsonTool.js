/**
 * JSON 工具类
 */
class JsonTool {
    constructor() {
        this.originalJson = '';
        this.formattedJson = '';
        this.error = null;
    }
    
    /**
     * 格式化 JSON (支持美化)
     */
    format(jsonStr, indent = 2) {
        try {
            const obj = this.parseJSON(jsonStr);
            this.formattedJson = JSON.stringify(obj, null, indent);
            this.error = null;
            return this.formattedJson;
        } catch (e) {
            this.error = e.message;
            throw e;
        }
    }
    
    /**
     * 压缩 JSON
     */
    compress(jsonStr) {
        try {
            const obj = this.parseJSON(jsonStr);
            this.formattedJson = JSON.stringify(obj);
            this.error = null;
            return this.formattedJson;
        } catch (e) {
            this.error = e.message;
            throw e;
        }
    }
    
    /**
     * 安全解析 JSON 字符串 (优先尝试原生解析，失败则尝试 JSON5)
     */
    parseJSON(jsonStr) {
        if (!jsonStr || jsonStr.trim() === '') return {};
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            try {
                // 超大体积文件直接禁用 JSON5 容错，因为纯 JS 版引擎对于超大文本扫描会导致数秒及更长时间的假死！
                if (jsonStr.length > 100 * 1024) throw e; 
                
                // 仅当环境中有 json5 时引入，如果是纯浏览器环境可按需切换
                if (typeof require !== 'undefined') {
                    const JSON5 = require('json5');
                    return JSON5.parse(jsonStr);
                }
                throw e;
            } catch (e2) {
                // 如果是超大文件抛出，提示原生报错；否则提示容错失败
                if (jsonStr.length > 100 * 1024) {
                    throw new Error(`无效的 JSON 格式（超大数据无法自动容错）: ${e.message}`);
                }
                throw new Error(`无效的 JSON 格式: ${e.message}`);
            }
        }
    }
    
    /**
     * 执行简单的语法验证
     */
    validate(jsonStr) {
        try {
            this.parseJSON(jsonStr);
            return { valid: true, error: null };
        } catch (e) {
            return { valid: false, error: e.message };
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = JsonTool;
}
