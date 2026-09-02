import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildAccountMonitoringRows } from '../src/services/accountMonitoringBuilder.ts';
import { classifyCredential } from '../src/services/credentialClassifier.ts';
import {
  computeTimeRangeTimestamps,
  isValidCustomDateRange,
  buildDenseTimeline,
} from '../src/services/timeRange.ts';
import { buildTokenMixSegments } from '../src/services/tokenMix.ts';
import { calculateEventCost } from '../src/services/modelPrices.ts';
import {
  buildRealtimeLogRows,
  isRequestEventSnapshot,
} from '../src/services/realtimeRowsBuilder.ts';
import { isConfigured } from '../src/services/storage.ts';
import { dynamicApiProxy } from '../lib/dynamic-proxy.mjs';

const credential = (overrides = {}) => ({
  id: 'credential-1',
  name: 'account.json',
  account: 'same@example.com',
  provider: 'codex',
  status: 'active',
  computedStatus: 'available',
  statusLabel: 'Available',
  planDisplayName: 'PLUS',
  primaryUsedPercent: 20,
  secondaryUsedPercent: null,
  totalRecentRequests: 0,
  recentSuccessRate: null,
  ...overrides,
});

test('analytics account totals are authoritative and snapshots do not double count them', () => {
  const rows = buildAccountMonitoringRows(
    [credential({ auth_index: 'auth-1', success: 42 })],
    [{
      event_hash: 'event-1',
      timestamp_ms: 100,
      model: 'gpt-5',
      auth_index: 'auth-1',
      auth_provider_snapshot: 'codex',
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      total_cost: 9,
      response_metadata: { status_code: 200 },
    }],
    [{
      id: 'account-1',
      auth_indices: ['auth-1'],
      auth_provider_snapshot: 'codex',
      calls: 1,
      success_calls: 1,
      failure_calls: 0,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      cost: 0,
      average_latency_ms: null,
    }]
  );

  assert.equal(rows.length, 1);
  assert.deepEqual(
    {
      calls: rows[0].totalCalls,
      input: rows[0].inputTokens,
      output: rows[0].outputTokens,
      total: rows[0].totalTokens,
      cost: rows[0].totalCost,
    },
    { calls: 1, input: 100, output: 50, total: 150, cost: 0 }
  );
});

test('an explicitly empty analytics range hides accounts instead of falling back to credential history', () => {
  // 范围内没有任何使用记录时账号不显示（与 CPAMP 一致），而不是回退展示历史累计。
  const rows = buildAccountMonitoringRows([
    credential({ success: 42, failed: 3, input_tokens: 1000, total_cost: 12 }),
  ], [], []);

  assert.equal(rows.length, 0);
});

test('accounts without usage in the scoped range are hidden, used ones stay', () => {
  const rows = buildAccountMonitoringRows(
    [
      credential({ id: 'used-1', name: 'used.json', auth_index: 'auth-used', account: 'used@example.com' }),
      credential({ id: 'idle-1', name: 'idle.json', auth_index: 'auth-idle', account: 'idle@example.com' }),
    ],
    [],
    [
      {
        id: 'stat-used',
        auth_indices: ['auth-used'],
        auth_provider_snapshot: 'codex',
        calls: 5,
        success_calls: 5,
      },
    ]
  );

  assert.deepEqual(rows.map((row) => row.account), ['used@example.com']);
  assert.equal(rows[0].totalCalls, 5);
});

test('in-range snapshots count as usage evidence even when account stats miss them', () => {
  const rows = buildAccountMonitoringRows(
    [credential({ auth_index: 'auth-1' })],
    [{
      event_hash: 'event-1',
      timestamp_ms: 100,
      model: 'gpt-5',
      auth_index: 'auth-1',
      auth_provider_snapshot: 'codex',
    }],
    []
  );

  assert.equal(rows.length, 1);
});

test('all credentials remain visible when no scoped range data is available', () => {
  // analytics 与范围快照两路都缺失时无法判定范围使用，保留凭证兜底（历史累计）。
  const rows = buildAccountMonitoringRows([credential({ success: 3, failed: 1 })], [], undefined);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalCalls, 4);
});

test('same account label from different providers remains separate', () => {
  const rows = buildAccountMonitoringRows(
    [
      credential({ id: 'codex-1', provider: 'codex', auth_index: 'codex-auth' }),
      credential({ id: 'claude-1', provider: 'claude', auth_index: 'claude-auth' }),
    ],
    [],
    [
      {
        id: 'codex-stat',
        account_snapshot: 'same@example.com',
        auth_provider_snapshot: 'codex',
        calls: 2,
        success_calls: 2,
      },
      {
        id: 'claude-stat',
        account_snapshot: 'same@example.com',
        auth_provider_snapshot: 'claude',
        calls: 3,
        success_calls: 3,
      },
    ]
  );

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => [row.provider, row.totalCalls]).sort(),
    [['claude', 3], ['codex', 2]]
  );
});

test('credential classification follows gateway lifecycle status', () => {
  // 'active' 是网关"有效且可执行"的权威判定，零流量的新启用账号也是可用。
  assert.equal(classifyCredential({ name: 'a', provider: 'codex', status: 'active' }), 'available');
  // has_credits=false 是订阅套餐账号的常态（无按量付费余额），不影响可用性。
  assert.equal(classifyCredential({
    name: 'b',
    provider: 'codex',
    status: 'active',
    quota: {
      signals: {
        'X-Codex-Primary-Used-Percent': '5',
        'X-Codex-Credits-Has-Credits': 'false',
        'X-Codex-Credits-Unlimited': 'false',
      },
    },
  }), 'available');
  assert.equal(classifyCredential({
    name: 'c',
    provider: 'codex',
    status: 'active',
    quota: { signals: { 'X-Codex-Primary-Used-Percent': '25' } },
  }), 'available');
  assert.equal(classifyCredential({
    name: 'd',
    provider: 'codex',
    status: 'active',
    recent_requests: [{ time: 'now', success: 1, failed: 0 }],
  }), 'available');
  // 使用率 ≥ 80% 与网关冷却标记属于额度风险。
  assert.equal(classifyCredential({
    name: 'e',
    provider: 'codex',
    status: 'active',
    quota: { signals: { 'X-Codex-Primary-Used-Percent': '94' } },
  }), 'quotaRisk');
  assert.equal(classifyCredential({
    name: 'f',
    provider: 'codex',
    status: 'active',
    unavailable: true,
  }), 'quotaRisk');
  // disabled 标志优先于 active 状态（刚耗尽被禁用、仍带 active 状态的账号）。
  assert.equal(classifyCredential({
    name: 'g',
    provider: 'codex',
    status: 'active',
    disabled: true,
  }), 'disabled');
  // unknown / pending / refreshing 等缺少有效判定的凭证才是状态待确认。
  assert.equal(classifyCredential({ name: 'h', provider: 'codex', status: 'unknown' }), 'unconfirmed');
  assert.equal(classifyCredential({ name: 'i', provider: 'codex', status: 'pending' }), 'unconfirmed');
  assert.equal(classifyCredential({ name: 'j', provider: 'codex' }), 'unconfirmed');
});

test('time ranges represent all history and reject reversed custom dates', () => {
  const now = new Date(2026, 7, 31, 12, 0, 0);
  assert.equal(computeTimeRangeTimestamps('all', undefined, undefined, now).fromMs, 1);
  assert.equal(isValidCustomDateRange('2026-08-31', '2026-08-01'), false);
  assert.equal(isValidCustomDateRange('', '2026-08-31'), false);

  const custom = computeTimeRangeTimestamps('custom', '2026-08-01', '2026-08-02', now);
  assert.equal(new Date(custom.fromMs).getDate(), 1);
  assert.equal(new Date(custom.toMs).getHours(), 23);
});

test('dense timeline zero-fills sparse ranges without losing real buckets', () => {
  const HOUR = 3_600_000;
  const from = 100 * HOUR;
  const to = 124 * HOUR; // 24 小时范围

  // 只有 08:00 一个真实桶（后端稀疏返回），应补零成连续小时轴。
  const sparse = buildDenseTimeline(
    [{ bucket_ms: 108 * HOUR, calls: 45, success: 42, failure: 3 }],
    from,
    to
  );
  assert.equal(sparse.length, 25);
  assert.equal(sparse[0].bucket_ms, from);
  assert.equal(sparse[8].calls, 45);
  const zeroed = sparse.filter((p) => p.calls === 0);
  assert.equal(zeroed.length, 24);

  // 多点序列按真实桶间距（天）推断步长，真实桶不重复不丢失。
  const daily = buildDenseTimeline(
    [
      { bucket_ms: 100 * HOUR, calls: 1 },
      { bucket_ms: 124 * HOUR, calls: 2 },
      { bucket_ms: 148 * HOUR, calls: 3 },
    ],
    100 * HOUR,
    148 * HOUR
  );
  assert.deepEqual(daily.map((p) => p.bucket_ms), [100 * HOUR, 124 * HOUR, 148 * HOUR]);

  // 不在网格上的真实桶保留，空范围返回空数组。
  const offGrid = buildDenseTimeline([{ bucket_ms: 101 * HOUR, calls: 7 }], 100 * HOUR, 102 * HOUR);
  assert.ok(offGrid.some((p) => p.calls === 7));
  assert.deepEqual(buildDenseTimeline([], from, to), []);
});

test('configuration requires both target URL and management key', () => {
  const base = { autoRefreshInterval: 10, timeRange: 'today' };
  assert.equal(isConfigured({ ...base, apiUrl: 'http://localhost:8317', apiKey: '' }), false);
  assert.equal(isConfigured({ ...base, apiUrl: '', apiKey: 'secret' }), false);
  assert.equal(isConfigured({ ...base, apiUrl: 'http://localhost:8317', apiKey: 'secret' }), true);
});

test('token mix segments subtract cache from input and deduct reasoning from output', () => {
  // input_tokens 含 cache 桶、reasoning_tokens ⊆ output_tokens（cpamp buildTokenMix 口径）。
  const segments = buildTokenMixSegments({
    total_calls: 10,
    success_calls: 9,
    failure_calls: 1,
    success_rate: 0.9,
    input_tokens: 1_000_000,
    output_tokens: 100_000,
    cached_tokens: 0,
    cache_read_tokens: 800_000,
    cache_creation_tokens: 20_000,
    reasoning_tokens: 40_000,
    total_tokens: 1_100_000,
    total_cost: 1,
    average_latency_ms: null,
    zero_token_calls: 0,
  });
  assert.deepEqual(
    segments.map((s) => [s.key, s.tokens]),
    [
      ['input', 180_000], // 1,000,000 - 800,000 - 20,000
      ['cached', 820_000], // 0 + 800,000 + 20,000
      ['output', 60_000], // 100,000 - 40,000 reasoning
      ['reasoning', 40_000],
    ]
  );
  // 分段之和不超过 total_tokens，环形图占比不再被 cache/reasoning 重复计数放大。
  const sum = segments.reduce((acc, s) => acc + s.tokens, 0);
  assert.equal(sum, 1_100_000);
  assert.deepEqual(buildTokenMixSegments(null), []);
});

test('analytics account stats merge into entries instead of overwriting them', () => {
  const credential = (overrides = {}) => ({
    id: 'credential-1',
    name: 'account.json',
    account: 'same@example.com',
    provider: 'codex',
    status: 'active',
    ...overrides,
  });

  // 同一凭证被两条 stat 命中（一条按 auth_index、一条按同名 label）时应累加。
  const rows = buildAccountMonitoringRows(
    [credential({ auth_index: 'auth-1' })],
    [],
    [
      {
        id: 'stat-1',
        auth_indices: ['auth-1'],
        auth_provider_snapshot: 'codex',
        calls: 16,
        success_calls: 16,
        input_tokens: 100,
        total_tokens: 100,
        cost: 2,
      },
      {
        id: 'stat-2',
        account_snapshot: 'same@example.com',
        auth_provider_snapshot: 'codex',
        calls: 1,
        success_calls: 0,
        failure_calls: 1,
        input_tokens: 50,
        total_tokens: 50,
        cost: 1,
      },
    ]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalCalls, 17);
  assert.equal(rows[0].successCalls, 16);
  assert.equal(rows[0].failureCalls, 1);
  assert.equal(rows[0].inputTokens, 150);
  assert.equal(rows[0].totalCost, 3);

  // 无凭证对应时，不同 provider 的同名身份保持独立行（label 别名只按 provider 注册）。
  const separated = buildAccountMonitoringRows(
    [],
    [],
    [
      {
        id: 'xai-stat',
        account_snapshot: 'shared@example.com',
        auth_provider_snapshot: 'xai',
        auth_indices: ['xai-idx'],
        calls: 35,
      },
      {
        id: 'codex-stat',
        account_snapshot: 'shared@example.com',
        auth_provider_snapshot: 'codex',
        auth_indices: ['codex-idx'],
        calls: 1,
      },
    ]
  );
  assert.equal(separated.length, 2);
  assert.deepEqual(
    separated.map((r) => [r.provider, r.totalCalls]).sort(),
    [['codex', 1], ['xai', 35]]
  );
});

test('event cost follows cpamp tier chain: explicit tiers win, fallback multiplies', () => {
  const tokens = { inputTokens: 100_000, outputTokens: 10_000, cachedTokens: 0 };

  // 无 serviceTiers 的价格簿：priority 依赖家族倍率（gpt-5.6 ×2），flex ×0.5。
  const plainPrices = { 'gpt-5.6-luna': { prompt: 0.2, completion: 1.2 } };
  assert.equal(
    calculateEventCost('gpt-5.6-luna', undefined, undefined, tokens, plainPrices, {
      requestServiceTier: 'priority',
      provider: 'codex',
    }),
    (100_000 * 0.2 + 10_000 * 1.2) / 1e6 * 2
  );
  assert.equal(
    calculateEventCost('gpt-5.6-luna', undefined, undefined, tokens, plainPrices, {
      requestServiceTier: 'flex',
      provider: 'codex',
    }),
    (100_000 * 0.2 + 10_000 * 1.2) / 1e6 * 0.5
  );

  // 有 serviceTiers/contextTiers 时使用显式档位价，不再叠乘倍率。
  const tieredPrices = {
    'gpt-5.6-luna': {
      prompt: 0.2,
      completion: 1.2,
      serviceTiers: [
        { mode: 'fast', serviceTier: 'priority', prompt: 0.4, completion: 2.4, promptConfigured: true, completionConfigured: true },
      ],
      contextTiers: [
        { thresholdTokens: 272_000, prompt: 0.4, completion: 1.8, promptConfigured: true, completionConfigured: true },
      ],
    },
  };
  assert.equal(
    calculateEventCost('gpt-5.6-luna', undefined, undefined, tokens, tieredPrices, {
      requestServiceTier: 'priority',
      provider: 'codex',
    }),
    (100_000 * 0.4 + 10_000 * 2.4) / 1e6
  );
  assert.equal(
    calculateEventCost('gpt-5.6-luna', undefined, undefined, { ...tokens, inputTokens: 300_000 }, tieredPrices),
    (300_000 * 0.4 + 10_000 * 1.8) / 1e6
  );

  // 无价格簿的 gpt-5.6 模型回退官方牌价；cacheRead 未配置时按 prompt×0.1 计费。
  assert.equal(
    calculateEventCost('gpt-5.6-luna', undefined, undefined, tokens, {}),
    (100_000 * 1 + 10_000 * 6) / 1e6
  );
  const cacheReadCost = calculateEventCost(
    'gpt-5.6-luna',
    undefined,
    undefined,
    { inputTokens: 100_000, outputTokens: 0, cachedTokens: 0, cacheReadTokens: 80_000 },
    { 'gpt-5.6-luna': { prompt: 0.2, completion: 1.2 } }
  );
  assert.ok(Math.abs(cacheReadCost - (20_000 * 0.2 + 80_000 * 0.02) / 1e6) < 1e-9);

  // 无任何价格信息时返回 null（UI 显示 --）。
  assert.equal(calculateEventCost('unknown-model', undefined, undefined, tokens, {}), null);
});

test('realtime stream drops credential header snapshots that are not request events', () => {
  const realEvent = {
    event_hash: 'ev-real-1',
    timestamp_ms: 2_000,
    model: 'gpt-5',
    account_snapshot: 'acct@example.com',
    auth_provider_snapshot: 'codex',
    latency_ms: 1_200,
    response_metadata: {
      status_code: 200,
      tokens: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    },
  };
  // header-snapshots 独有的行：只有配额/trace 等 header 字段，无状态码/token/耗时。
  const headerOnlySnapshot = {
    event_hash: 'snap-header-1',
    timestamp_ms: 1_000,
    model: 'gpt-5',
    account_snapshot: 'acct@example.com',
    auth_provider_snapshot: 'codex',
    header_quota_used_percent: 42,
    header_trace_id: 'trace-1',
    response_metadata: {
      quota: { used_percent: 42 },
      trace: { primary_trace_id: 'trace-1' },
    },
  };

  assert.equal(isRequestEventSnapshot(realEvent), true);
  assert.equal(isRequestEventSnapshot(headerOnlySnapshot), false);

  const rows = buildRealtimeLogRows([headerOnlySnapshot, realEvent], {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'ev-real-1');
  // 快照行不参与流统计：真实行的调用数与最近状态不受幽灵行影响。
  assert.equal(rows[0].requestCount, 1);
  assert.deepEqual(rows[0].recentPattern, [true]);
});

test('snapshots carrying request evidence (tokens or timing) stay in the realtime stream', () => {
  const tokenedSnapshot = {
    event_hash: 'snap-tokened-1',
    timestamp_ms: 3_000,
    model: 'gpt-5',
    input_tokens: 10,
    output_tokens: 5,
  };
  const timedSnapshot = {
    event_hash: 'snap-timed-1',
    timestamp_ms: 4_000,
    model: 'gpt-5',
    latency_ms: 800,
  };

  assert.equal(isRequestEventSnapshot(tokenedSnapshot), true);
  assert.equal(isRequestEventSnapshot(timedSnapshot), true);
  const rows = buildRealtimeLogRows([tokenedSnapshot, timedSnapshot], {});
  assert.deepEqual(rows.map((r) => r.key), ['snap-timed-1', 'snap-tokened-1']);
});


// --- 动态反向代理（/api-proxy）端到端验证 ---

const originOf = (server, scheme = 'http') => `${scheme}://127.0.0.1:${server.address().port}`;

const startServer = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

// undici fetch 默认 keep-alive，需要主动断开连接否则 server.close() 永不完成、事件循环不退出。
const stopServer = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

const startMount = async () => {
  // 与 server.mjs 相同的挂载方式：路由命中后把原始 req/res 交给中间件。
  return startServer(http.createServer((req, res) => dynamicApiProxy(req, res)));
};

let selfSignedCache = null;
const selfSignedCert = () => {
  if (!selfSignedCache) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpamonitor-test-'));
    const keyPath = path.join(dir, 'key.pem');
    const certPath = path.join(dir, 'cert.pem');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-days', '1', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-subj', '/CN=localhost',
    ]);
    selfSignedCache = {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
    };
  }
  return selfSignedCache;
};

test('dynamic proxy forwards directly and strips control headers', async () => {
  let seen = null;
  const target = http.createServer((req, res) => {
    seen = { url: req.url, host: req.headers.host, targetHeader: req.headers['x-target-url'], proxyHeader: req.headers['x-proxy-url'] };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, via: 'direct' }));
  });
  const targetOrigin = originOf(await startServer(target));
  const mount = await startMount();
  const mountOrigin = originOf(mount);

  const resp = await fetch(`${mountOrigin}/api-proxy/v0/management/auth-files`, {
    headers: {
      'x-target-url': `${targetOrigin}/base`,
      authorization: 'Bearer test-key',
    },
  });
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.via, 'direct');
  // 目标路径 = 目标 basePath + 代理路径；host 重写为目标；控制头不透传。
  assert.equal(seen.url, '/base/v0/management/auth-files');
  assert.equal(seen.host, new URL(targetOrigin).host);
  assert.equal(seen.targetHeader, undefined);
  assert.equal(seen.proxyHeader, undefined);
  await stopServer(target);
  await stopServer(mount);
});

test('dynamic proxy routes http targets through an upstream proxy via absolute URI', async () => {
  let targetHits = 0;
  let proxySeen = {};
  let proxiedBody = '';
  const target = http.createServer(() => { targetHits += 1; });
  const targetOrigin = originOf(await startServer(target));
  const proxy = http.createServer((req, res) => {
    proxySeen = { url: req.url, host: req.headers.host, proxyHeader: req.headers['x-proxy-url'], targetHeader: req.headers['x-target-url'] };
    req.on('data', (chunk) => { proxiedBody += chunk; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, via: 'upstream-proxy' }));
    });
  });
  const proxyOrigin = originOf(await startServer(proxy));
  const mount = await startMount();
  const mountOrigin = originOf(mount);

  const resp = await fetch(`${mountOrigin}/api-proxy/v0/management/monitoring/analytics`, {
    method: 'POST',
    headers: {
      'x-target-url': `${targetOrigin}/`,
      'x-proxy-url': proxyOrigin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from_ms: 1, to_ms: 2 }),
  });
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.via, 'upstream-proxy');
  // 绝对 URI 形式经代理转发，目标服务不应被直接命中；POST body 完整透传。
  assert.equal(targetHits, 0);
  assert.equal(proxySeen.url, `${targetOrigin}/v0/management/monitoring/analytics`);
  assert.equal(proxySeen.host, new URL(targetOrigin).host);
  assert.equal(proxySeen.proxyHeader, undefined);
  assert.equal(proxySeen.targetHeader, undefined);
  assert.deepEqual(JSON.parse(proxiedBody), { from_ms: 1, to_ms: 2 });
  await stopServer(target);
  await stopServer(proxy);
  await stopServer(mount);
});

test('dynamic proxy tunnels https targets through an upstream proxy with CONNECT', async () => {
  const connectRequests = [];
  let targetSeen = {};
  const { key, cert } = selfSignedCert();
  const target = https.createServer({ key, cert }, (req, res) => {
    targetSeen = { url: req.url, host: req.headers.host, proxyHeader: req.headers['x-proxy-url'] };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, via: 'tunnel-target' }));
  });
  const targetOrigin = originOf(await startServer(target), 'https');
  const targetPort = Number(new URL(targetOrigin).port);
  // 极简 CONNECT 代理：握手后双向接管 socket（目标为自签名证书）。
  const proxy = http.createServer(() => {});
  proxy.on('connect', (req, socket) => {
    connectRequests.push(req.url);
    const [host, port] = req.url.split(':');
    const upstream = net.connect(Number(port) || 443, host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    socket.on('close', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  const proxyOrigin = originOf(await startServer(proxy));
  const mount = await startMount();
  const mountOrigin = originOf(mount);

  const resp = await fetch(`${mountOrigin}/api-proxy/health`, {
    headers: {
      'x-target-url': targetOrigin,
      'x-proxy-url': proxyOrigin,
      authorization: 'Bearer test-key',
    },
  });
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.via, 'tunnel-target');
  assert.deepEqual(connectRequests, [`${new URL(targetOrigin).hostname}:${targetPort}`]);
  assert.equal(targetSeen.url, '/health');
  assert.equal(targetSeen.host, new URL(targetOrigin).host);
  assert.equal(targetSeen.proxyHeader, undefined);
  await stopServer(target);
  await stopServer(proxy);
  await stopServer(mount);
});

test('dynamic proxy rejects unsupported upstream proxy schemes and missing target', async () => {
  const mount = await startMount();
  const mountOrigin = originOf(mount);

  const badScheme = await fetch(`${mountOrigin}/api-proxy/health`, {
    headers: { 'x-target-url': 'http://example.com', 'x-proxy-url': 'socks5://127.0.0.1:1080' },
  });
  assert.equal(badScheme.status, 400);
  assert.match((await badScheme.json()).error, /Unsupported upstream proxy scheme/);

  const noTarget = await fetch(`${mountOrigin}/api-proxy/health`);
  assert.equal(noTarget.status, 400);
  assert.match((await noTarget.json()).error, /x-target-url/);
  await stopServer(mount);
});
