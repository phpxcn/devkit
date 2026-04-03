/* 
  CSV 转换器 (基于 PapaParse)
*/
class CSVConverter {
    // 导出数据
    static export(dataset, options = {}) {
        const {
            delimiter = ',',
            rowDelimiter = '\n',
            quoteAll = false,
            useBom = true,
            prefix = '',
            suffix = ''
        } = options;

        const escapeCell = (val) => {
            let str = String(val === null || val === undefined ? '' : val);
            const needsQuote = quoteAll || str.includes(delimiter) || str.includes(rowDelimiter) || str.includes('"');
            if (needsQuote) {
                str = '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        let result = useBom ? '\uFEFF' : '';
        
        // 处理表头
        if (dataset.headers && dataset.headers.length > 0) {
            result += prefix + dataset.headers.map(escapeCell).join(delimiter) + suffix + rowDelimiter;
        }
        
        // 处理数据行
        dataset.rows.forEach((row, index) => {
            result += prefix + row.map(escapeCell).join(delimiter) + suffix;
            if (index < dataset.rows.length - 1) result += rowDelimiter;
        });

        return result;
    }

    // 导入数据
    static async import(csvText) {
        // 使用 PapaParse 解析导入依然是高效的
        const Papa = require('papaparse');
        const TableDataset = require('../models/TableDataset');
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: false, // 使用原始矩阵模式，由 TableDataset 手动处理表头
                skipEmptyLines: 'greedy',
                complete: (results) => {
                    const dataset = new TableDataset();
                    if (results.data && results.data.length > 0) {
                        dataset.fromMatrix(results.data, true);
                    }
                    resolve(dataset);
                },
                error: (err) => reject(new Error(`CSV 解析失败: ${err.message}`))
            });
        });
    }
}

/* 
  Excel 转换器 (基于 XLSX)
*/
class ExcelConverter {
    static async import(fileBuffer, options = {}) {
        const XLSX = require('xlsx');
        const TableDataset = require('../models/TableDataset');
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = options.sheetName || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const data = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: ''
        });
        
        const dataset = new TableDataset();
        if (data.length > 0) {
            dataset.headers = data[0].map(h => h || '');
            dataset.rows = data.slice(1);
            dataset.updateMetadata();
        }
        return dataset;
    }
    
    static async export(dataset, options = {}) {
        const XLSX = require('xlsx');
        const matrix = dataset.toMatrix(true);
        const worksheet = XLSX.utils.aoa_to_sheet(matrix);
        
        if (options.autoWidth) {
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            const wscols = [];
            for (let i = range.s.c; i <= range.e.c; i++) {
                let maxLen = 0;
                for (let j = range.s.r; j <= range.e.r; j++) {
                    const cell = worksheet[XLSX.utils.encode_cell({ r: j, c: i })];
                    if (cell && cell.v) {
                        maxLen = Math.max(maxLen, String(cell.v).length);
                    }
                }
                wscols.push({ wch: maxLen + 2 });
            }
            worksheet['!cols'] = wscols;
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1');
        
        return XLSX.write(workbook, { 
            type: 'buffer', 
            bookType: options.format || 'xlsx' 
        });
    }
}

if (typeof module !== 'undefined') {
    module.exports = { CSVConverter, ExcelConverter };
}
