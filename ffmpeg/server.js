const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 服务器配置
const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public'); // 存放HTML文件的目录

// 确保public目录存在
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR);
  console.log(`创建了public目录: ${PUBLIC_DIR}`);
}

// 创建服务器
const server = http.createServer((req, res) => {
  // 设置必要的安全头，解决SharedArrayBuffer问题
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  
  // 解析请求的URL
  const parsedUrl = url.parse(req.url);
  let filePath = path.join(PUBLIC_DIR, parsedUrl.pathname);
  
  // 如果请求的是目录，默认返回index.html
  if (fs.statSync(filePath, { throwIfNoEntry: false })?.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  
  // 确定文件内容类型
  const extname = path.extname(filePath);
  let contentType = 'text/html';
  
  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
      contentType = 'image/jpg';
      break;
  }
  
  // 读取并返回文件
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // 文件未找到
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 未找到文件</h1>', 'utf-8');
      } else {
        // 服务器错误
        res.writeHead(500);
        res.end(`服务器错误: ${err.code} 请检查控制台`);
        console.error('服务器错误:', err);
      }
    } else {
      // 成功返回文件
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`服务器已启动，访问: http://localhost:${PORT}`);
  console.log(`HTML文件应放在: ${PUBLIC_DIR}`);
  console.log('按 Ctrl+C 停止服务器');
});
