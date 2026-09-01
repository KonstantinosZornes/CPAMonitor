import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAccountMonitoringRows } from '../src/services/accountMonitoringBuilder.ts';
import { classifyCredential } from '../src/services/credentialClassifier.ts';
import {
  computeTimeRangeTimestamps,
  isValidCustomDateRange,
  buildDenseTimeline,
} from '../src/services/timeRange.ts';
import { buildTokenMixSegments } from '../src/services/tokenMix.ts';
import { calculateEventCost } from '../src/services/modelPrices.ts';
import { isConfigured } from '../src/services/storage.ts';

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

test('an explicitly empty analytics range does not fall back to credential history', () => {
  const [row] = buildAccountMonitoringRows([
    credential({ success: 42, failed: 3, input_tokens: 1000, total_cost: 12 }),
  ], [], []);

  assert.equal(row.totalCalls, 0);
  assert.equal(row.totalTokens, 0);
  assert.equal(row.totalCost, 0);
  assert.equal(row.successRate, 0);
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
