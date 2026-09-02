import type { HeaderSnapshotItem } from '@/types/monitoring';
import type { ModelPrice } from './modelPrices';
import { calculateEventCost } from './modelPrices.ts';

export interface RealtimeLogRow {
  key: string;
  snapshot: HeaderSnapshotItem;
  timestampMs: number;
  model: string;
  requestedModel?: string;
  resolvedModel?: string;
  account?: string;
  provider?: string;
  apiKeyMasked?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  failed: boolean;
  statusCode: number;
  failSummary?: string;
  ttftMs: number | null;
  latencyMs: number | null;
  outputTps: number | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number | null;
  quotaUsedPercent: number | null;
  traceId?: string;
  // 按流（账号×Provider×模型）滚动累计，对齐 cpamp 实时表口径
  streamKey: string;
  requestCount: number;
  successRate: number; // 0 - 100
  recentPattern: boolean[]; // 最近 ≤10 次，true=成功
}

const RECENT_PATTERN_LIMIT = 10;

const toPositiveNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

export const maskApiKeyHash = (hash?: string): string | undefined => {
  const clean = (hash || '').trim().toLowerCase();
  if (!clean) return undefined;
  return clean.length > 10 ? `${clean.slice(0, 10)}…` : clean;
};

/**
 * 实时流只展示"请求事件"。header-snapshots 是每个凭证一条的最新 header 状态
 * （配额/错误/trace），没有状态码、token、耗时中的任何一项；未命中 analytics
 * 事件的快照若渲染出来，只会是一行绿色 OK + 全 0 的"没数据"假请求。analytics
 * 事件（含与快照合并后的行）必有 useMonitorData 合成的 response_metadata.status_code。
 */
export const isRequestEventSnapshot = (snap: HeaderSnapshotItem): boolean =>
  snap.response_metadata?.status_code !== undefined ||
  [
    snap.tokens?.input_tokens,
    snap.tokens?.output_tokens,
    snap.tokens?.cached_tokens,
    snap.tokens?.total_tokens,
    snap.usage?.prompt_tokens,
    snap.usage?.completion_tokens,
    snap.usage?.total_tokens,
    snap.response_metadata?.tokens?.input_tokens,
    snap.response_metadata?.tokens?.output_tokens,
    snap.response_metadata?.tokens?.total_tokens,
    snap.input_tokens,
    snap.output_tokens,
    snap.cached_tokens,
    snap.cache_read_tokens,
    snap.cache_creation_tokens,
    snap.reasoning_tokens,
    snap.total_tokens,
    snap.latency_ms,
    snap.duration_ms,
    snap.ttft_ms,
    snap.response_metadata?.latency_ms,
    snap.response_metadata?.duration_ms,
    snap.response_metadata?.ttft_ms,
  ].some((value) => toPositiveNumber(value) > 0);

export const buildRealtimeLogRows = (
  snapshots: HeaderSnapshotItem[],
  modelPrices: Record<string, ModelPrice>
): RealtimeLogRow[] => {
  const sortedAsc = [...snapshots]
    .filter((s) => Number.isFinite(s.timestamp_ms) && s.timestamp_ms > 0)
    .filter(isRequestEventSnapshot)
    .sort((a, b) => a.timestamp_ms - b.timestamp_ms || a.event_hash.localeCompare(b.event_hash));

  const metricsByStream = new Map<
    string,
    { total: number; success: number; pattern: boolean[] }
  >();

  const enriched = sortedAsc.map((snap) => {
    const account =
      snap.auth_label_snapshot || snap.account_snapshot || snap.auth_file_snapshot || undefined;
    const provider = snap.auth_provider_snapshot || undefined;
    const model = snap.model || snap.requested_model || snap.resolved_model || '-';
    const streamKey = [account || '-', provider || '-', model].join('::');

    const inputTokens = toPositiveNumber(
      snap.tokens?.input_tokens ??
        snap.input_tokens ??
        snap.response_metadata?.tokens?.input_tokens ??
        snap.usage?.prompt_tokens
    );
    const outputTokens = toPositiveNumber(
      snap.tokens?.output_tokens ??
        snap.output_tokens ??
        snap.response_metadata?.tokens?.output_tokens ??
        snap.usage?.completion_tokens
    );
    const cachedTokens = toPositiveNumber(
      snap.tokens?.cached_tokens ??
        snap.cached_tokens ??
        snap.response_metadata?.tokens?.cached_tokens ??
        snap.cache_read_tokens
    );
    const reasoningTokens = toPositiveNumber(snap.reasoning_tokens);
    const totalTokens = toPositiveNumber(
      snap.tokens?.total_tokens ?? snap.total_tokens
    ) || inputTokens + outputTokens + reasoningTokens;

    const statusCodeRaw = snap.response_metadata?.status_code;
    const failed = statusCodeRaw !== undefined ? statusCodeRaw >= 400 : false;
    const statusCode = statusCodeRaw ?? (failed ? 500 : 200);
    // 与 cpamp 口径一致：失败请求或携带了真实 token 计数的请求才计入统计
    const statsIncluded = failed || inputTokens > 0 || outputTokens > 0;
    // header-snapshots 独有的行没有状态码（useMonitorData 只为 analytics 事件合成
    // status_code），成败未知：既不计数也不产出"最近状态"圆点，避免虚增绿点。
    const hasOutcome = statusCodeRaw !== undefined;

    const latencyMs =
      toPositiveNumber(snap.latency_ms ?? snap.duration_ms ?? snap.response_metadata?.latency_ms) ||
      null;
    const ttftMs = toPositiveNumber(snap.ttft_ms ?? snap.response_metadata?.ttft_ms) || null;
    const outputTps =
      outputTokens > 0 && latencyMs ? outputTokens / (latencyMs / 1000) : null;

    const previous = metricsByStream.get(streamKey) ?? { total: 0, success: 0, pattern: [] };
    const pattern = hasOutcome
      ? [...previous.pattern, !failed].slice(-RECENT_PATTERN_LIMIT)
      : previous.pattern;
    const total = previous.total + (statsIncluded ? 1 : 0);
    const success = previous.success + (statsIncluded && !failed ? 1 : 0);
    metricsByStream.set(streamKey, { total, success, pattern });

    const effectiveServiceTier =
      snap.request_service_tier || snap.service_tier || snap.response_service_tier || undefined;

    return {
      key: snap.event_hash,
      snapshot: snap,
      timestampMs: snap.timestamp_ms,
      model,
      requestedModel: snap.requested_model,
      resolvedModel: snap.resolved_model,
      account,
      provider,
      apiKeyMasked: maskApiKeyHash(snap.api_key_hash),
      reasoningEffort: snap.reasoning_effort || undefined,
      serviceTier: effectiveServiceTier,
      failed,
      statusCode,
      failSummary: snap.fail_summary || undefined,
      ttftMs,
      latencyMs,
      outputTps,
      inputTokens,
      outputTokens,
      cachedTokens,
      cacheReadTokens: toPositiveNumber(snap.cache_read_tokens),
      reasoningTokens,
      totalTokens,
      cost: calculateEventCost(
        snap.model,
        snap.requested_model,
        snap.resolved_model,
        {
          inputTokens,
          outputTokens,
          cachedTokens,
          cacheReadTokens: toPositiveNumber(snap.cache_read_tokens),
          cacheCreationTokens: toPositiveNumber(snap.cache_creation_tokens),
        },
        modelPrices,
        {
          requestServiceTier: snap.request_service_tier,
          serviceTier: snap.service_tier,
          responseServiceTier: snap.response_service_tier,
          provider: snap.auth_provider_snapshot,
          executorType: snap.executor_type,
        }
      ),
      quotaUsedPercent: snap.header_quota_used_percent ?? null,
      traceId: snap.header_trace_id || undefined,
      streamKey,
      requestCount: total,
      successRate: total > 0 ? (success / total) * 100 : 100,
      recentPattern: pattern,
    } satisfies RealtimeLogRow;
  });

  return enriched.sort(
    (a, b) =>
      b.timestampMs - a.timestampMs ||
      b.requestCount - a.requestCount ||
      a.key.localeCompare(b.key)
  );
};
