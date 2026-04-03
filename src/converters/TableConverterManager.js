/**
 * 表格转换管理器
 * 统一调度 CSV, Excel, Markdown, JSON, SQL 等转换器
 */
class TableConverterManager {
    constructor() {
        this.converters = {};
        this.dataset = null; // 当前内存中的表格数据对象 (TableDataset)
    }
    
    /**
     * 注册转换器
     */
    register(format, converter) {
        this.converters[format] = converter;
    }
    
    /**
     * 设置当前数据集
     */
    setDataset(dataset) {
        this.dataset = dataset;
    }

    /**
     * 将特定格式内容导入并转换为 TableDataset
     */
    async asyncImport(content, format, options = {}) {
        const converter = this.converters[format];
        if (!converter || !converter.import) {
            throw new Error(`暂不支持 ${format} 格式的导入`);
        }
        return await converter.import(content, options);
    }
    
    /**
     * 将当前的 TableDataset 转换为指定格式
     */
    async asyncExport(dataset, format, options = {}) {
        const converter = this.converters[format];
        if (!converter || !converter.export) {
            throw new Error(`暂不支持导出 ${format} 格式`);
        }
        return await converter.export(dataset, options);
    }
    
    getSupportedFormats() {
        return Object.keys(this.converters);
    }
}

if (typeof module !== 'undefined') {
    module.exports = TableConverterManager;
}
