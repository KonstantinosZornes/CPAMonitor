#!/usr/bin/env node
/**
 * CPAMonitor 生产服务器：托管 dist 静态产物，并挂载与 Vite dev/preview
 * 完全一致的 /api-proxy 动态反向代理（转发 x-target-url 指定的目标服务，
 * 可选经 x-proxy-url 指定的上游 HTTP(S) 代理，支持自签名证书），
 * 使容器化部署无需目标服务开启 CORS。
 */
import http from 'node:http';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynamicApiProxy, PROXY_MOUNT_PATH } from './lib/dynamic-proxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 5217;

// 注入到 index.html 的代理开关，前端 shouldUseLocalProxy() 据此走 /api-proxy
const PROXY_FLAG_SCRIPT = `<script>window.__CPA_MONITOR_PROXY__=true;</script>`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

const isProxyRoute = (pathname) =>
  pathname === PROXY_MOUNT_PATH || pathname.startsWith(`${PROXY_MOUNT_PATH}/`);

let cachedIndexHtml = null;
const getIndexHtml = async () => {
  if (cachedIndexHtml === null) {
    const raw = await fsp.readFile(path.join(DIST_DIR, 'index.html'), 'utf8');
    cachedIndexHtml = raw.includes('</head>')
      ? raw.replace('</head>', `${PROXY_FLAG_SCRIPT}</head>`)
      : `${PROXY_FLAG_SCRIPT}${raw}`;
  }
  return cachedIndexHtml;
};

const sendHtml = async (res, method) => {
  const html = await getIndexHtml();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES['.html'],
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(method === 'HEAD' ? undefined : html);
};

const fileHeaders = (filePath, stat) => {
  const ext = path.extname(filePath).toLowerCase();
  const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
  return {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Length': stat.size,
  };
};

const sendFile = (res, filePath, stat) => {
  res.writeHead(200, fileHeaders(filePath, stat));
  fs.createReadStream(filePath).pipe(res);
};

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }

  if (isProxyRoute(pathname)) {
    dynamicApiProxy(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end();
    return;
  }

  try {
    const resolved = path.resolve(DIST_DIR, `.${path.posix.normalize(pathname)}`);
    if (resolved !== DIST_DIR && !resolved.startsWith(`${DIST_DIR}${path.sep}`)) {
      res.statusCode = 403;
      res.end();
      return;
    }

    const stat = await fsp.stat(resolved).catch(() => null);
    if (stat?.isFile()) {
      if (req.method === 'HEAD') {
        res.writeHead(200, fileHeaders(resolved, stat));
        res.end();
      } else {
        sendFile(res, resolved, stat);
      }
      return;
    }

    // 带扩展名的路径视为静态资源请求，缺失时返回 404；其余路径回退到 SPA 入口
    if (path.extname(pathname)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    await sendHtml(res, req.method);
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: `Failed to read static asset: ${err.message}` }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CPAMonitor started: http://${HOST}:${PORT}`);
  console.log(`Dynamic proxy enabled: ${PROXY_MOUNT_PATH} (CPAMP target specified by the x-target-url header, optional upstream proxy via x-proxy-url)`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
