const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 服务器配置
const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public'); // 存放HTML文件（默认首页）
const STATIC_DIR = path.join(__dirname, 'static'); // 存放JS、CSS、图片等静态资源

// 确保必要目录存在
[PUBLIC_DIR, STATIC_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    console.log(`创建了目录: ${dir}`);
  }
});

// 定义常见文件的MIME类型（扩展支持更多静态资源）
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
};

// 创建服务器
const server = http.createServer((req, res) => {
  // 设置必要的安全头（如需使用SharedArrayBuffer可取消注释）
  // res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  
  // 解析请求URL（处理中文路径和查询参数）
  const parsedUrl = url.parse(decodeURIComponent(req.url));
  let requestPath = parsedUrl.pathname.trim() || '/'; // 默认请求根路径

  // 核心逻辑：判断请求的是HTML（public目录）还是静态资源（static目录）
  let filePath;
  if (requestPath === '/' || path.extname(requestPath) === '.html') {
    // 1. 请求HTML文件（根路径默认返回public/index.html）
    filePath = path.join(PUBLIC_DIR, requestPath === '/' ? 'index.html' : requestPath.slice(1));
    // 如果请求的HTML不存在，尝试找opus_streaming_player.html（兼容原有逻辑）
    if (!fs.existsSync(filePath) && requestPath === '/') {
      filePath = path.join(PUBLIC_DIR, 'play-ogg-opus.html');
    }
  } else {
    // 2. 请求静态资源（JS/CSS/图片等，从static目录读取）
    // 去掉路径开头的"/"，拼接static目录（如"/js/xxx.js" → "static/js/xxx.js"）
    filePath = path.join(STATIC_DIR, requestPath.slice(1));
  }

  // 防止路径遍历攻击（禁止访问上级目录）
  if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 禁止访问</h1>', 'utf-8');
    return;
  }

  // 确定文件内容类型（默认text/plain）
  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'text/plain';

  // 读取并返回文件
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // 文件未找到（区分HTML和静态资源的404提示）
        res.writeHead(404, { 'Content-Type': 'text/html' });
        const notFoundMsg = `
          <h1>404 未找到文件</h1>
          <p>请求路径: ${req.url}</p>
          <p>查找路径: ${filePath}</p>
          <p>提示：HTML文件请放在 public 目录，静态资源请放在 static 目录</p>
        `;
        res.end(notFoundMsg, 'utf-8');
      } else {
        // 服务器错误
        res.writeHead(500);
        res.end(`服务器错误: ${err.code}`, 'utf-8');
        console.error('服务器错误:', err);
      }
    } else {
      // 成功返回文件（添加缓存控制，静态资源缓存1小时，HTML不缓存）
      const cacheControl = extname === '.html' 
        ? 'no-cache' 
        : 'public, max-age=3600'; // 静态资源缓存1小时
      
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl
      });
      res.end(content);
    }
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`服务器已启动，访问: http://localhost:${PORT}`);
  console.log(`- HTML文件目录: ${PUBLIC_DIR}`);
  console.log(`- 静态资源目录: ${STATIC_DIR}`);
  console.log('使用示例：');
  console.log('  1. HTML引用JS：<script src="/js/xxx.js"></script>（对应static/js/xxx.js）');
  console.log('  2. HTML引用图片：<img src="/images/xxx.png">（对应static/images/xxx.png）');
  console.log('按 Ctrl+C 停止服务器');
});