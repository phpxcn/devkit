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
                // 仅当环境中有 json5 时引入，如果是纯浏览器环境可按需切换
                if (typeof require !== 'undefined') {
                    const JSON5 = require('json5');
                    return JSON5.parse(jsonStr);
                }
                throw e;
            } catch (e2) {
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
