const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'release');

/**
 * 递归删除文件夹内容，但保留指定的后缀文件
 */
function cleanup() {
    if (!fs.existsSync(releaseDir)) return;

    const keptExtensions = ['.dmg', '.exe', '.deb', '.yml', '.blockmap'];
    const files = fs.readdirSync(releaseDir);

    files.forEach(file => {
        const fullPath = path.join(releaseDir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            console.log(`正在清理临时目录: ${file}`);
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            const ext = path.extname(file).toLowerCase();
            // 如果不是我们想要的安装包格式，且不是辅助校验文件，则处理掉
            if (!keptExtensions.includes(ext) || file.includes('zip') || file.includes('AppImage')) {
                console.log(`正在删除余冗文件: ${file}`);
                fs.unlinkSync(fullPath);
            }
        }
    });

    console.log('✅ 清理完成！仅保留 dmg, exe, deb 等发布安装包。');
}

cleanup();
