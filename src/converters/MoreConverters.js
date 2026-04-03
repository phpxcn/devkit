/**
 * 更多格式转换器 (SQL, HTML, JSON, LaTeX, XML)
 */

class SQLConverter {
    static export(dataset, options = {}) {
        const {
            tableName = 'myTable',
            dbType = 'MySQL',
            createTable = true,
            dropTable = false,
            batchInsert = true,
            primaryKey = 'id'
        } = options;

        let sql = "";
        const quote = dbType === 'PostgreSQL' || dbType === 'SQLite' ? '"' : '`';
        const qTableName = `${quote}${tableName}${quote}`;

        if (dropTable) sql += `DROP TABLE IF EXISTS ${qTableName};\n`;
        
        if (createTable) {
            sql += `CREATE TABLE ${qTableName} (\n`;
            sql += `  ${quote}${primaryKey}${quote} INT PRIMARY KEY AUTO_INCREMENT,\n`;
            dataset.headers.forEach((h, i) => {
                const colName = h.replace(/\s+/g, '_');
                sql += `  ${quote}${colName}${quote} TEXT${i === dataset.headers.length - 1 ? '' : ','}\n`;
            });
            sql += `);\n\n`;
        }

        const cols = dataset.headers.map(h => `${quote}${h.replace(/\s+/g, '_')}${quote}`).join(', ');
        
        if (batchInsert) {
            sql += `INSERT INTO ${qTableName} (${cols}) VALUES\n`;
            const valueRows = dataset.rows.map(row => {
                const vals = row.map(v => {
                    if (v === null || v === undefined) return 'NULL';
                    return `'${v.toString().replace(/'/g, "''")}'`;
                }).join(', ');
                return `(${vals})`;
            });
            sql += valueRows.join(',\n') + ';';
        } else {
            dataset.rows.forEach(row => {
                const vals = row.map(v => {
                    if (v === null || v === undefined) return 'NULL';
                    return `'${v.toString().replace(/'/g, "''")}'`;
                }).join(', ');
                sql += `INSERT INTO ${qTableName} (${cols}) VALUES (${vals});\n`;
            });
        }
        
        return sql;
    }
}

class HTMLConverter {
    static async import(htmlStr) {
        const TableDataset = require('../models/TableDataset');
        const ds = new TableDataset();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlStr, 'text/html');
        const table = doc.querySelector('table') || doc.querySelector('.table-custom');
        if (!table) throw new Error('未找到 HTML 表格');
        
        let rows = [];
        if (table.tagName === 'TABLE') {
            Array.from(table.rows).forEach(tr => {
                rows.push(Array.from(tr.cells).map(c => c.textContent.trim()));
            });
        } else {
            const divRows = table.querySelectorAll('.tr');
            Array.from(divRows).forEach(tr => {
                const cells = tr.querySelectorAll('.td, .th');
                if (cells.length > 0) rows.push(Array.from(cells).map(c => c.textContent.trim()));
            });
        }
        
        if (rows.length > 0) {
            ds.fromMatrix(rows, true);
        }
        ds.updateMetadata();
        return ds;
    }

    static export(dataset, options = {}) {
        const {
            escapeHtml = true,
            useDiv = false,
            minify = false,
            tbody = true,
            caption = '',
            className = 'table-custom',
            tableId = 'my-table'
        } = options;

        const escape = (str) => {
            if (!escapeHtml) return str;
            return String(str).replace(/[&<>"']/g, m => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[m]);
        };

        const br = minify ? "" : "\n";
        const sp = minify ? "" : "  ";

        if (useDiv) {
            // CSS+DIV 布局
            let html = `<div class="${className}" id="${tableId}">${br}`;
            // Headers
            html += `${sp}<div class="tr row-header">${br}`;
            dataset.headers.forEach(h => html += `${sp}${sp}<div class="th">${escape(h)}</div>${br}`);
            html += `${sp}</div>${br}`;
            // Rows
            dataset.rows.forEach(row => {
                html += `${sp}<div class="tr">${br}`;
                row.forEach(cell => html += `${sp}${sp}<div class="td">${escape(cell)}</div>${br}`);
                html += `${sp}</div>${br}`;
            });
            html += `</div>`;
            return html;
        } else {
            // TABLE 布局
            let html = `<table class="${className}" id="${tableId}">${br}`;
            if (caption) html += `${sp}<caption>${escape(caption)}</caption>${br}`;
            
            if (tbody) html += `${sp}<thead>${br}`;
            html += `${sp}${sp}<tr>${br}`;
            dataset.headers.forEach(h => html += `${sp}${sp}${sp}<th>${escape(h)}</th>${br}`);
            html += `${sp}${sp}</tr>${br}`;
            if (tbody) html += `${sp}</thead>${br}${sp}<tbody>${br}`;

            dataset.rows.forEach(row => {
                html += `${sp}${sp}<tr>${br}`;
                row.forEach(cell => html += `${sp}${sp}${sp}<td>${escape(cell)}</td>${br}`);
                html += `${sp}${sp}</tr>${br}`;
            });

            if (tbody) html += `${sp}</tbody>${br}`;
            html += `</table>`;
            return html;
        }
    }
}

class JSONConverter {
    static async import(jsonStr) {
        const TableDataset = require('../models/TableDataset');
        const ds = new TableDataset();
        try {
            const obj = JSON.parse(jsonStr);
            if (Array.isArray(obj)) {
                 if (obj.length > 0 && typeof obj[0] === 'object' && !Array.isArray(obj[0])) {
                      const headers = new Set();
                      obj.forEach(row => {
                          if (row && typeof row === 'object') {
                              Object.keys(row).forEach(k => headers.add(k));
                          }
                      });
                      ds.headers = Array.from(headers);
                      ds.rows = obj.map(row => ds.headers.map(h => {
                           let val = row ? row[h] : '';
                           return val !== null && val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : '';
                      }));
                 } else if (obj.length > 0 && Array.isArray(obj[0])) {
                      ds.fromMatrix(obj, true);
                 } else {
                      // single array
                      ds.fromMatrix([obj], true);
                 }
            } else if (typeof obj === 'object') {
                 // single object
                 ds.headers = Object.keys(obj);
                 ds.rows = [ds.headers.map(h => {
                     let val = obj[h];
                     return val !== null && val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : '';
                 })];
            }
            ds.updateMetadata();
            return ds;
        } catch(e) {
            throw new Error('解析 JSON 失败: ' + e.message);
        }
    }

    static export(dataset, options = {}) {
        const {
            dataFormat = 'Array of Objects',
            parseJson = true,
            compact = false,
            rootName = '',
            indent = '2 spaces'
        } = options;

        const indentMap = { '2 spaces': 2, '4 spaces': 4, '8 spaces': 8, 'Tabs': '\t' };
        const indentVal = compact ? null : (indentMap[indent] || 2);

        const tryParse = (val) => {
            if (!parseJson) return val;
            const s = String(val).trim();
            if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                try { return JSON.parse(s); } catch(e) { return val; }
            }
            return val;
        };

        let result;
        if (dataFormat === 'Array of Objects') {
            result = dataset.rows.map(row => {
                const obj = {};
                dataset.headers.forEach((h, i) => obj[h] = tryParse(row[i]));
                return obj;
            });
        } else if (dataFormat === '2D Array') {
            result = dataset.rows.map(row => row.map(tryParse));
            result.unshift(dataset.headers);
        } else if (dataFormat === 'Column Array') {
            result = {};
            dataset.headers.forEach((h, i) => {
                result[h] = dataset.rows.map(row => tryParse(row[i]));
            });
        } else if (dataFormat === 'Keyed Array') {
            result = {};
            dataset.rows.forEach(row => {
                const key = row[0];
                result[key] = row.slice(1).map(tryParse);
            });
        }

        if (rootName) {
            const finalObj = {};
            finalObj[rootName] = result;
            result = finalObj;
        }

        return JSON.stringify(result, null, indentVal);
    }
}

class XMLConverter {
    static async import(xmlStr) {
        const TableDataset = require('../models/TableDataset');
        const ds = new TableDataset();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('XML 解析错误');
        
        const root = doc.documentElement;
        if (!root) return ds;
        const records = Array.from(root.children);
        if (records.length === 0) return ds;
        
        if (records[0].attributes.length > 0 && records[0].children.length === 0) {
            const headers = new Set();
            records.forEach(r => Array.from(r.attributes).forEach(a => headers.add(a.name)));
            ds.headers = Array.from(headers);
            ds.rows = records.map(r => ds.headers.map(h => r.getAttribute(h) || ''));
        } else {
            const headers = new Set();
            records.forEach(r => Array.from(r.children).forEach(c => headers.add(c.tagName)));
            ds.headers = Array.from(headers);
            ds.rows = records.map(r => ds.headers.map(h => {
                const node = r.querySelector(h);
                return node ? node.textContent : '';
            }));
        }
        ds.updateMetadata();
        return ds;
    }

    static export(dataset, options = {}) {
        const {
            rootNode = 'dataset',
            rowNode = 'record',
            declaration = true,
            attributeMode = false,
            cdata = false,
            compactXml = false,
            escapeXml = true,
            encoding = 'UTF-8',
            indent = '2 spaces'
        } = options;

        const indentMap = { '2 spaces': '  ', '4 spaces': '    ', '8 spaces': '        ', 'Tabs': '\t' };
        const sp = compactXml ? '' : (indentMap[indent] || '  ');
        const br = compactXml ? '' : '\n';

        const escape = (str) => {
            if (!escapeXml) return str;
            return String(str).replace(/[<>&"']/g, m => ({
                '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
            })[m]);
        };

        const wrap = (val) => {
            if (cdata) return `<![CDATA[${val}]]>`;
            return escape(val);
        };

        let xml = declaration ? `<?xml version="1.0" encoding="${encoding}"?>${br}` : "";
        xml += `<${rootNode}>${br}`;
        
        dataset.rows.forEach(row => {
            if (attributeMode) {
                let attrs = dataset.headers.map((h, i) => `${h.replace(/\s+/g, '_')}="${escape(row[i])}"`).join(' ');
                xml += `${sp}<${rowNode} ${attrs}/>${br}`;
            } else {
                xml += `${sp}<${rowNode}>${br}`;
                dataset.headers.forEach((h, i) => {
                    const tag = h.replace(/\s+/g, '_');
                    xml += `${sp}${sp}<${tag}>${wrap(row[i])}</${tag}>${br}`;
                });
                xml += `${sp}</${rowNode}>${br}`;
            }
        });
        
        xml += `</${rootNode}>`;
        return xml;
    }
}

class YAMLConverter {
    static async import(yamlStr) {
        const yaml = require('js-yaml');
        const TableDataset = require('../models/TableDataset');
        const ds = new TableDataset();
        const obj = yaml.load(yamlStr);
        if (Array.isArray(obj) && obj.length > 0) {
            const headers = new Set();
            obj.forEach(row => { if(row && typeof row==='object') Object.keys(row).forEach(k => headers.add(k)) });
            ds.headers = Array.from(headers);
            ds.rows = obj.map(row => ds.headers.map(h => {
                const val = row[h];
                return val !== null && val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : '';
            }));
            ds.updateMetadata();
            return ds;
        }
        throw new Error('YAML 需为对象数组格式');
    }

    static export(dataset, options = {}) {
        const yaml = require('js-yaml');
        const { style = 'block', quotes = 'none', indent = '2 spaces' } = options;
        const indentMap = { '2 spaces': 2, '4 spaces': 4, '8 spaces': 8 };
        
        const objects = dataset.rows.map(row => {
            const obj = {};
            dataset.headers.forEach((h, idx) => obj[h] = row[idx]);
            return obj;
        });

        return yaml.dump(objects, {
            indent: indentMap[indent] || 2,
            flowLevel: style === 'flow' ? 0 : -1,
            quotingType: quotes === 'single' ? "'" : (quotes === 'double' ? '"' : null)
        });
    }
}

class ASCIIConverter {
    static export(dataset, options = {}) {
        const { borderStyle = 'mysql', align = 'Left', commentWrap = '' } = options;
        const matrix = [dataset.headers, ...dataset.rows];
        if (matrix.length === 0) return '';

        const colWidths = dataset.headers.map((_, colIdx) => 
            Math.max(...matrix.map(row => (row[colIdx] || '').toString().length))
        );

        // 边框配置表 [顶, 中, 底, 分隔, 边]
        const styles = {
            mysql:     { t: '+', m: '+', b: '+', s: '-', v: '|' },
            separated: { t: '=', m: '=', b: '-', s: '-', v: '|' },
            horizontal:{ t: '-', m: '-', b: '-', s: '-', v: ' ' },
            compact:   { t: ' ', m: '-', b: '-', s: '-', v: ' ' },
            dots:      { t: '.', m: '.', b: '.', s: '.', v: ':' },
            rounded:   { t: '-', m: '-', b: '-', s: '-', v: '|' },
            unicode_double: { t: '═', m: '═', b: '═', s: '═', v: '║', c: ['╔','╦','╗','╠','╬','╣','╚','╩','╝'] },
            unicode_single: { t: '─', m: '─', b: '─', s: '─', v: '│', c: ['┌','┬','┐','├','┼','┤','└','┴','┘'] },
            rst_grid:  { t: '-', m: '=', b: '-', s: '-', v: '|' },
            rst_simple:{ t: '=', m: '=', b: '=', s: '=', v: ' ' }
        };

        const st = styles[borderStyle] || styles.mysql;
        const drawLine = (edge, sep) => {
            if (st.c) { // Unicode 复杂模式
                const [l, m, r] = edge === 'top' ? [st.c[0], st.c[1], st.c[2]] : 
                                 edge === 'mid' ? [st.c[3], st.c[4], st.c[5]] : [st.c[6], st.c[7], st.c[8]];
                return l + colWidths.map(w => sep.repeat(w + 2)).join(m) + r;
            }
            return st.t + colWidths.map(w => sep.repeat(w + 2)).join(st.m) + st.t;
        };

        const pad = (str, len, side) => {
            const s = String(str);
            if (side === 'Center') {
                const total = len - s.length;
                const left = Math.floor(total / 2);
                return ' '.repeat(left) + s + ' '.repeat(total - left);
            }
            return side === 'Right' ? s.padStart(len) : s.padEnd(len);
        };

        let result = drawLine('top', st.s) + '\n';
        // Headers
        result += st.v + dataset.headers.map((h, i) => ` ${pad(h, colWidths[i], align)} `).join(st.v) + st.v + '\n';
        result += drawLine('mid', st.s) + '\n';
        // Rows
        dataset.rows.forEach(row => {
            result += st.v + row.map((cell, i) => ` ${pad(cell, colWidths[i], align)} `).join(st.v) + st.v + '\n';
        });
        result += drawLine('bot', st.s);

        // 注释包装逻辑
        if (commentWrap) {
            const lines = result.split('\n');
            if (commentWrap.includes('...')) { // 闭合型 e.g. /* ... */
                const [pre, suf] = commentWrap.split('...');
                return pre + '\n' + lines.map(l => ' ' + l).join('\n') + '\n' + suf;
            }
            return lines.map(l => commentWrap + ' ' + l).join('\n');
        }

        return result;
    }
}

class LaTeXConverter {
    static export(dataset, options = {}) {
        const {
            envType = 'tabular',
            borderStyle = 'all',
            boldHeader = true,
            caption = '',
            captionPos = 'Above',
            refLabel = '',
            textAlign = 'l',
            tableAlign = 'c',
            escapeLatex = true,
            floating = true
        } = options;

        const escape = (str) => {
            if (!escapeLatex) return str;
            return String(str).replace(/[&%$#_{}~^\\]/g, m => ({
                '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '\\': '\\textbackslash{}'
            })[m]);
        };

        const colDef = dataset.headers.map(() => borderStyle === 'all' ? `|${textAlign}` : textAlign).join('') + (borderStyle === 'all' ? '|' : '');
        let tex = "";

        if (floating) tex += `\\begin{table}[htbp]\n\\centering\n`;
        if (caption && captionPos === 'Above') tex += `\\caption{${escape(caption)}}\n`;
        if (refLabel) tex += `\\label{${refLabel}}\n`;

        tex += `\\begin{${envType}}{${colDef}}\n`;
        
        const hline = borderStyle === 'none' ? "" : (borderStyle === 'horizontal' || borderStyle === 'excel' ? "\\hline\n" : "\\hline\n");
        tex += borderStyle === 'compact' ? "" : hline;

        // Header
        const headers = dataset.headers.map(h => boldHeader ? `\\textbf{${escape(h)}}` : escape(h)).join(' & ');
        tex += `  ${headers} \\\\\n`;
        tex += hline;

        // Rows
        dataset.rows.forEach(row => {
            tex += `  ${row.map(escape).join(' & ')} \\\\\n`;
            if (borderStyle === 'all') tex += `  \\hline\n`;
        });

        if (borderStyle !== 'all' && borderStyle !== 'none' && borderStyle !== 'compact') tex += `  \\hline\n`;
        tex += `\\end{${envType}}\n`;
        
        if (caption && captionPos === 'Below') tex += `\\caption{${escape(caption)}}\n`;
        if (floating) tex += `\\end{table}`;

        return tex;
    }
}

if (typeof module !== 'undefined') {
    module.exports = { SQLConverter, HTMLConverter, JSONConverter, XMLConverter, YAMLConverter, ASCIIConverter, LaTeXConverter };
}
