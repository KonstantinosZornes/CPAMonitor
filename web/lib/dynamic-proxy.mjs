import https from 'https';
import http from 'http';

export const PROXY_MOUNT_PATH = '/api-proxy';

/**
 * 动态反向代理中间件（connect 兼容签名）。
 * 根据 `x-target-url` 请求头将 /api-proxy 下的请求转发到目标 CPAMP 服务，
 * 转发时透传请求头（去除 x-target-url 与 host）、按目标地址重写 host，
 * 并跳过 TLS 证书校验以支持自签名证书。
 *
 * 兼容两种挂载方式：
 * - Vite dev/preview：middlewares.use('/api-proxy', dynamicApiProxy)（连接层可能已剥掉前缀）
 * - 生产 server.mjs：路由判断后直接传入原始请求（仍带前缀）
 * 因此统一用 replace 兜底剥离 /api-proxy 前缀。
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export const dynamicApiProxy = (req, res) => {
  const targetUrl = (req.headers['x-target-url'] || '');
  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'CPAMP target URL is not configured (missing x-target-url header)' }));
    return;
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const targetPath = (req.url || '/').replace(/^\/api-proxy/, '') || '/';
    const targetBasePath = parsedTarget.pathname.replace(/\/+$/, '');
    const combinedPath = `${targetBasePath}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
    const fullUrl = new URL(combinedPath, parsedTarget.origin);
    const client = fullUrl.protocol === 'https:' ? https : http;
    const headers = {};

    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'x-target-url' || key.toLowerCase() === 'host') continue;
      if (value !== undefined) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
    headers.host = fullUrl.host;

    const proxyReq = client.request(
      fullUrl,
      {
        method: req.method,
        headers,
        rejectUnauthorized: false,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Proxy forwarding failed: ${err.message}` }));
    });
    req.pipe(proxyReq);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Invalid CPAMP target URL: ${err.message}` }));
  }
};
