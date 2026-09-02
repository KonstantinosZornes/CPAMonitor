import https from 'https';
import http from 'http';
import tls from 'tls';

export const PROXY_MOUNT_PATH = '/api-proxy';

/**
 * 动态反向代理中间件（connect 兼容签名）。
 * 根据 `x-target-url` 请求头将 /api-proxy 下的请求转发到目标 CPAMP 服务，
 * 转发时透传请求头（去除 x-target-url、x-proxy-url 与 host）、按目标地址重写 host，
 * 并跳过 TLS 证书校验以支持自签名证书。
 *
 * 可选的 `x-proxy-url` 请求头指定上游 HTTP(S) 正向代理（如 http://127.0.0.1:7890，
 * 支持 http://user:pass@host:port 鉴权）：
 * - HTTP 目标 + HTTP 代理：以绝对 URI 形式直接经代理请求；
 * - 其余组合（HTTPS 目标，或 HTTPS 代理）：先向代理发起 CONNECT 隧道，
 *   再在隧道上做 TLS（HTTPS 目标）并转发。
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
  const proxyUrl = (req.headers['x-proxy-url'] || '');

  try {
    const parsedTarget = new URL(targetUrl);
    const parsedProxy = proxyUrl ? new URL(proxyUrl) : null;
    if (parsedProxy && parsedProxy.protocol !== 'http:' && parsedProxy.protocol !== 'https:') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Unsupported upstream proxy scheme: ${parsedProxy.protocol} (use http:// or https://)` }));
      return;
    }

    const targetPath = (req.url || '/').replace(/^\/api-proxy/, '') || '/';
    const targetBasePath = parsedTarget.pathname.replace(/\/+$/, '');
    const combinedPath = `${targetBasePath}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
    const fullUrl = new URL(combinedPath, parsedTarget.origin);
    const headers = {};

    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'x-target-url' || lower === 'x-proxy-url' || lower === 'host') continue;
      if (value !== undefined) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
    headers.host = fullUrl.host;

    const respond = (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    };
    const fail = (err) => {
      if (res.headersSent) { res.destroy(); return; }
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Proxy forwarding failed: ${err.message}` }));
    };

    const proxyAuth = parsedProxy && (parsedProxy.username || parsedProxy.password)
      ? `Basic ${Buffer.from(
          `${decodeURIComponent(parsedProxy.username)}:${decodeURIComponent(parsedProxy.password)}`
        ).toString('base64')}`
      : null;

    if (!parsedProxy) {
      forwardDirect(req, res, fullUrl, headers, respond, fail);
      return;
    }
    forwardViaProxy(req, res, fullUrl, headers, parsedProxy, proxyAuth, respond, fail);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Invalid CPAMP target URL: ${err.message}` }));
  }
};

const forwardDirect = (req, res, fullUrl, headers, respond, fail) => {
  const client = fullUrl.protocol === 'https:' ? https : http;
  const proxyReq = client.request(
    fullUrl,
    {
      method: req.method,
      headers,
      rejectUnauthorized: false,
    },
    respond
  );
  proxyReq.on('error', fail);
  req.pipe(proxyReq);
};

const forwardViaProxy = (req, res, fullUrl, headers, parsedProxy, proxyAuth, respond, fail) => {
  const proxyPort = Number(parsedProxy.port) || (parsedProxy.protocol === 'https:' ? 443 : 80);
  const proxyIsHttps = parsedProxy.protocol === 'https:';
  const targetIsHttps = fullUrl.protocol === 'https:';
  const targetPort = Number(fullUrl.port) || (targetIsHttps ? 443 : 80);
  const connectPath = `${fullUrl.hostname}:${targetPort}`;

  // HTTP 目标 + HTTP 代理：经典正向代理的绝对 URI 形式，无需建隧道。
  if (!targetIsHttps && !proxyIsHttps) {
    const proxyReq = http.request({
      host: parsedProxy.hostname,
      port: proxyPort,
      method: req.method,
      path: fullUrl.href,
      headers: {
        ...headers,
        ...(proxyAuth ? { 'proxy-authorization': proxyAuth } : {}),
      },
    }, respond);
    proxyReq.on('error', fail);
    req.pipe(proxyReq);
    return;
  }

  // 其余组合（HTTPS 目标，或 HTTPS 代理）：先 CONNECT 建隧道，再在隧道上转发。
  const connectReq = (proxyIsHttps ? https : http).request({
    host: parsedProxy.hostname,
    port: proxyPort,
    method: 'CONNECT',
    path: connectPath,
    headers: {
      host: connectPath,
      ...(proxyAuth ? { 'proxy-authorization': proxyAuth } : {}),
    },
  });
  connectReq.on('connect', (connectRes, socket) => {
    if (connectRes.statusCode !== 200) {
      socket.destroy();
      fail(new Error(`Upstream proxy CONNECT failed with HTTP ${connectRes.statusCode}`));
      return;
    }
    if (targetIsHttps) {
      // TLS 握手完成后在加密隧道上发起对目标的请求。
      const tlsSocket = tls.connect({
        socket,
        servername: fullUrl.hostname,
        rejectUnauthorized: false,
      }, () => issueOverSocket(req, res, fullUrl, headers, tlsSocket, true, respond, fail));
      tlsSocket.on('error', fail);
    } else {
      // HTTPS 代理 + HTTP 目标：隧道本身已加密到代理，隧道内明文转发。
      issueOverSocket(req, res, fullUrl, headers, socket, false, respond, fail);
    }
  });
  connectReq.on('error', fail);
  connectReq.end();
};

const issueOverSocket = (req, res, fullUrl, headers, socket, isHttps, respond, fail) => {
  // 用一次性 agent 把既有 socket 交给 node 的 HTTP 客户端，复用其响应解析与流式管道。
  const ClientAgent = isHttps ? https.Agent : http.Agent;
  const agent = new ClientAgent({ keepAlive: false });
  agent.createConnection = () => socket;
  const client = isHttps ? https : http;
  const proxyReq = client.request(
    fullUrl,
    { method: req.method, headers, agent, rejectUnauthorized: false },
    respond
  );
  proxyReq.on('error', fail);
  req.pipe(proxyReq);
};
