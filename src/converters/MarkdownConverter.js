/**
 * Markdown 表格转换器
 */
class MarkdownConverter {
    static async import(mdContent) {
        const lines = mdContent.trim().split('\n');
        const TableDataset = require('../models/TableDataset');
        const dataset = new TableDataset();
        let inTable = false;
        let tableRows = [];
        
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('|') && line.endsWith('|')) {
                inTable = true;
                const cells = line.split('|').filter((cell, idx, arr) => 
                   idx > 0 && idx < arr.length - 1
                ).map(c => c.trim());
                
                if (!line.includes('---')) { // 跳过分隔行
                    tableRows.push(cells);
                }
            } else if (inTable) {
                break;
            }
        }
        
        if (tableRows.length > 0) {
            dataset.headers = tableRows[0];
            dataset.rows = tableRows.slice(1);
            dataset.updateMetadata();
            dataset.saveToHistory();
        }
        
        return dataset;
    }
    
    static exportSync(dataset, options = {}) {
        if (!dataset || !dataset.rows) return "";

        const {
            escapeMd = true,
            boldHeader = true,
            boldFirstCol = false,
            align = 'Left',
            simpleMd = false,
            prettyMd = true,
            multiLine = 'preserve'
        } = options;

        const escapeCell = (val) => {
            let str = String(val === null || val === undefined ? '' : val);
            if (escapeMd) {
                // 转义 | 以及 Markdown 特殊控制符
                str = str.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
            }
            if (multiLine === 'preserve') str = str.replace(/\n|\r\n/g, '<br>');
            else if (multiLine === 'escape') str = str.replace(/\n|\r\n/g, '\\n');
            else if (multiLine === 'break') str = str.replace(/\n|\r\n/g, ' ');
            return str;
        };

        const headers = dataset.headers.map((h, i) => {
            let val = escapeCell(h);
            if (boldHeader) val = `**${val}**`;
            return val;
        });

        // 生成对齐行
        const alignMap = { 'Left': ':---', 'Center': ':---:', 'Right': '---:' };
        const alignLine = dataset.headers.map(() => alignMap[align] || ':---');

        // 生成数据行
        const formattedRows = dataset.rows.map(row => {
            return row.map((cell, i) => {
                let val = escapeCell(cell);
                if (boldFirstCol && i === 0) val = `**${val}**`;
                return val;
            });
        });

        const matrix = [headers, alignLine, ...formattedRows];
        
        let output = "";
        matrix.forEach(row => {
            if (simpleMd) {
               output += row.join(' | ') + '\n';
            } else {
               output += '| ' + row.join(' | ') + ' |\n';
            }
        });
        
        return output.trim();
    }
}

if (typeof module !== 'undefined') {
    module.exports = MarkdownConverter;
}
