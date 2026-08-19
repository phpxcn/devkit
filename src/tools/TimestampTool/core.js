/**
 * 开发者工具箱 - 时间戳处理核心逻辑
 */
class TimestampTool {
    constructor() {
        this.currentTimestamp = null;
        this.currentDate = null;
    }
    
    /**
     * 将时间戳或日期字符串转换为多种标准日期对象
     */
    convert(input) {
        let date;
        let isMilliseconds = false;

        // 尝试判断是否为纯数字时间戳
        if (/^\d+$/.test(input)) {
            const ts = parseInt(input, 10);
            isMilliseconds = ts > 1e12; // 常用阈值判断：若大于 1000 亿则视为毫秒级
            date = new Date(isMilliseconds ? ts : ts * 1000);
        } else {
            // 尝试作为普通日期字符串解析
            date = new Date(input);
        }

        if (isNaN(date.getTime())) {
            throw new Error('无效的时间戳或日期格式');
        }

        this.currentDate = date;
        this.currentTimestamp = date.getTime();

        return {
            timestamp: this.currentTimestamp,
            seconds: Math.floor(this.currentTimestamp / 1000),
            isMilliseconds: isMilliseconds,
            iso: date.toISOString(),
            local: date.toLocaleString(),
            utc: date.toUTCString(),
            type: isMilliseconds ? '毫秒级 (ms)' : '秒级 (s)'
        };
    }
    
    /**
     * 获取当前系统时间状态
     */
    getNow() {
        const now = new Date();
        return {
            seconds: Math.floor(now.getTime() / 1000),
            milliseconds: now.getTime(),
            iso: now.toISOString(),
            local: now.toLocaleString()
        };
    }
    
    /**
     * 高级格式化工具 (可选)
     */
    format(fmt, date = this.currentDate) {
        if (!date) return '';
        const o = {
            "M+": date.getMonth() + 1,
            "d+": date.getDate(),
            "h+": date.getHours(),
            "m+": date.getMinutes(),
            "s+": date.getSeconds(),
            "q+": Math.floor((date.getMonth() + 3) / 3),
            "S": date.getMilliseconds()
        };
        if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
        for (let k in o)
            if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        return fmt;
    }
}

if (typeof module !== 'undefined') {
    module.exports = TimestampTool;
}
