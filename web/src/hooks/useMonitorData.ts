import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchHealth,
  fetchStatus,
  fetchAuthFiles,
  fetchDashboardSummary,
  fetchHeaderSnapshots,
  fetchMonitoringAnalytics,
  fetchModelPrices,
} from '@/services/api';
import {
  computeCredentialMetrics,
  enrichCredential,
} from '@/services/credentialClassifier';
import { buildAccountMonitoringRows } from '@/services/accountMonitoringBuilder';
import { ModelPrice } from '@/services/modelPrices';
import { isConfigured, getStoredSettings, TimeRangeType } from '@/services/storage';
import { computeTimeRangeTimestamps, buildDenseTimeline } from '@/services/timeRange';
import { useTranslation } from '@/i18n';
import { CredentialCounts, EnrichedCredential } from '@/types/auth';
import { DashboardSummaryResponse, CollectorStatus } from '@/types/dashboard';
import { HeaderSnapshotItem, AccountMonitoringRow } from '@/types/monitoring';

export interface MonitorDataState {
  health: { ok: boolean; service?: string } | null;
  collectorStatus: CollectorStatus | null;
  credentials: EnrichedCredential[];
  credentialCounts: CredentialCounts;
  accountRows: AccountMonitoringRow[];
  dashboard: DashboardSummaryResponse | null;
  snapshots: HeaderSnapshotItem[];
  modelPrices: Record<string, ModelPrice>;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  error: string | null;
}

const INITIAL_COUNTS: CredentialCounts = {
  total: 0,
  available: 0,
  needsAttention: 0,
  quotaRisk: 0,
  disabled: 0,
  unconfirmed: 0,
};

export function useMonitorData(timeRange?: TimeRangeType, customStart?: string, customEnd?: string) {
  const [data, setData] = useState<MonitorDataState>({
    health: null,
    collectorStatus: null,
    credentials: [],
    credentialCounts: INITIAL_COUNTS,
    accountRows: [],
    dashboard: null,
    snapshots: [],
    modelPrices: {},
    isLoading: isConfigured(),
    isRefreshing: false,
    lastUpdated: null,
    error: null,
  });

  const isFirstLoad = useRef(true);
  const reqIdRef = useRef(0);
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const loadData = useCallback(async (overrideRange?: TimeRangeType, overrideStart?: string, overrideEnd?: string) => {
    const currentReqId = ++reqIdRef.current;
    if (!isConfigured()) {
      setData({
        health: null,
        collectorStatus: null,
        credentials: [],
        credentialCounts: INITIAL_COUNTS,
        accountRows: [],
        dashboard: null,
        snapshots: [],
        modelPrices: {},
        isLoading: false,
        isRefreshing: false,
        lastUpdated: null,
        error: null,
      });
      return;
    }

    // Requests may overlap when the user changes range. Only the newest response is committed.
    setData((prev) => ({
      ...prev,
      isLoading: isFirstLoad.current,
      isRefreshing: !isFirstLoad.current,
      error: null,
    }));

    try {
      const stored = getStoredSettings();
      const range = overrideRange || timeRange || stored.timeRange || 'today';
      const cStart = overrideStart || customStart || stored.customStartDate;
      const cEnd = overrideEnd || customEnd || stored.customEndDate;
      const { fromMs, toMs, todayStartMs } = computeTimeRangeTimestamps(range, cStart, cEnd);

      const [
        healthRes,
        statusRes,
        authFilesRes,
        dashRes,
        snapsRes,
        analyticsRes,
        pricesRes,
      ] = await Promise.allSettled([
        fetchHealth(),
        fetchStatus(),
        fetchAuthFiles(),
        fetchDashboardSummary(todayStartMs, Date.now()),
        fetchHeaderSnapshots(),
        fetchMonitoringAnalytics(fromMs, toMs),
        fetchModelPrices(),
      ]);

      if (currentReqId !== reqIdRef.current) {
        return; // Discard stale response
      }

      const health = healthRes.status === 'fulfilled' ? healthRes.value : null;
      const collectorStatus = statusRes.status === 'fulfilled' ? statusRes.value : null;
      const rawAuthFiles = authFilesRes.status === 'fulfilled' ? authFilesRes.value : [];
      let dashboard = dashRes.status === 'fulfilled' ? dashRes.value : null;
      const rawSnapshots =
        snapsRes.status === 'fulfilled' && snapsRes.value?.items
          ? snapsRes.value.items
          : [];
      const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value : null;

      // 合并 Snapshots 与 Analytics Events
      // 注意：/v0/management/usage 与 analytics events 同源于 usage_events 表，
      // 同时注入会导致同一请求被重复计数与重复展示，因此只保留 analytics 一路。
      const mergedSnapshotsMap = new Map<string, HeaderSnapshotItem>();

      // 1. 注入 Analytics Events (最精准的 SQLite 事件明细)
      const analyticsEvents = analytics?.events?.items || [];
      analyticsEvents.forEach((ev: any) => {
        const hash = ev.event_hash || `ev_${ev.timestamp_ms}_${ev.model}`;
        mergedSnapshotsMap.set(hash, {
          event_hash: hash,
          timestamp_ms: ev.timestamp_ms || ev.created_at_ms || Date.now(),
          model: ev.model,
          requested_model: ev.requested_model || ev.model,
          resolved_model: ev.resolved_model,
          auth_file_snapshot: ev.auth_file_snapshot,
          auth_index: ev.auth_index,
          account_snapshot: ev.account_snapshot,
          auth_label_snapshot: ev.auth_label_snapshot,
          auth_provider_snapshot: ev.auth_provider_snapshot,
          source: ev.source,
          endpoint: ev.endpoint,
          api_key_hash: ev.api_key_hash || ev.apiKeyHash,
          reasoning_effort: ev.reasoning_effort,
          service_tier: ev.service_tier,
          request_service_tier: ev.request_service_tier,
          response_service_tier: ev.response_service_tier,
          executor_type: ev.executor_type,
          fail_summary: ev.fail_summary,
          latency_ms: ev.latency_ms ?? ev.duration_ms ?? undefined,
          duration_ms: ev.latency_ms ?? ev.duration_ms ?? undefined,
          ttft_ms: ev.ttft_ms ?? undefined,
          reasoning_tokens: ev.reasoning_tokens,
          cache_read_tokens: ev.cache_read_tokens,
          cache_creation_tokens: ev.cache_creation_tokens,
          header_quota_used_percent: ev.header_quota_used_percent ?? ev.quota_used_percent ?? undefined,
          header_trace_id: ev.header_trace_id || ev.trace_id,
          response_metadata: {
            status_code: ev.fail_status_code || (ev.failed ? 500 : 200),
            cost: ev.cost ?? ev.total_cost,
            total_cost: ev.total_cost ?? ev.cost,
            latency_ms: ev.latency_ms ?? ev.duration_ms ?? undefined,
            ttft_ms: ev.ttft_ms ?? undefined,
            quota: {
              used_percent: ev.header_quota_used_percent ?? ev.quota_used_percent ?? undefined,
            },
            trace: {
              primary_trace_id: ev.header_trace_id || ev.trace_id,
            },
            tokens: {
              input_tokens: ev.input_tokens || ev.prompt_tokens,
              output_tokens: ev.output_tokens || ev.completion_tokens,
              cached_tokens: ev.cached_tokens,
              total_tokens: ev.total_tokens,
            },
          },
        });
      });

      // 2. 注入 Header Snapshots (安全克隆与深度合并)
      rawSnapshots.forEach((snap) => {
        const existing = mergedSnapshotsMap.get(snap.event_hash);
        if (existing) {
          const mergedSnap: HeaderSnapshotItem = {
            ...existing,
            ...snap,
            latency_ms: snap.latency_ms ?? existing.latency_ms,
            ttft_ms: snap.ttft_ms ?? existing.ttft_ms,
            response_metadata: {
              ...existing.response_metadata,
              ...snap.response_metadata,
              latency_ms: snap.response_metadata?.latency_ms ?? existing.response_metadata?.latency_ms ?? existing.latency_ms,
              ttft_ms: (snap.response_metadata as any)?.ttft_ms ?? existing.response_metadata?.ttft_ms ?? existing.ttft_ms,
            },
          };
          mergedSnapshotsMap.set(snap.event_hash, mergedSnap);
        } else {
          mergedSnapshotsMap.set(snap.event_hash, snap);
        }
      });

      const finalSnapshots = Array.from(mergedSnapshotsMap.values())
        .filter((s) => s.timestamp_ms >= fromMs && s.timestamp_ms <= toMs)
        .sort((a, b) => b.timestamp_ms - a.timestamp_ms);

      // The selected analytics range is authoritative for every range-dependent dashboard field.
      if (analytics?.summary) {
        const sum = analytics.summary;
        if (!dashboard) {
          dashboard = {
            generated_at_ms: analytics.generated_at_ms ?? Date.now(),
            today: {
              total_calls: 0,
              success_calls: 0,
              failure_calls: 0,
              success_rate: 0,
              input_tokens: 0,
              output_tokens: 0,
              cached_tokens: 0,
              cache_read_tokens: 0,
              cache_creation_tokens: 0,
              reasoning_tokens: 0,
              total_tokens: 0,
              total_cost: 0,
              average_latency_ms: null,
              zero_token_calls: 0,
            },
            top_models_today: [],
            model_cost_rank: [],
            traffic_timeline: [],
          };
        }
        dashboard.today = {
          total_calls: sum.total_calls ?? sum.calls ?? 0,
          success_calls: sum.success_calls ?? 0,
          failure_calls: sum.failure_calls ?? sum.failed_calls ?? 0,
          success_rate: sum.success_rate !== undefined
            ? (sum.success_rate > 1 ? sum.success_rate / 100 : sum.success_rate)
            : 0,
          input_tokens: sum.input_tokens ?? 0,
          output_tokens: sum.output_tokens ?? 0,
          cached_tokens: sum.cached_tokens ?? 0,
          cache_read_tokens: sum.cache_read_tokens ?? 0,
          cache_creation_tokens: sum.cache_creation_tokens ?? 0,
          reasoning_tokens: sum.reasoning_tokens ?? 0,
          total_tokens: sum.total_tokens ?? sum.tokens ?? 0,
          total_cost: sum.total_cost ?? sum.cost ?? 0,
          average_latency_ms: sum.average_latency_ms ?? sum.avg_latency_ms ?? null,
          zero_token_calls: sum.zero_token_calls ?? 0,
        };
      }

      if (dashboard && Array.isArray(analytics?.model_stats)) {
        dashboard.top_models_today = analytics.model_stats.map((m: any) => ({
          model: m.model,
          calls: m.calls ?? 0,
          tokens: m.total_tokens ?? ((m.input_tokens ?? 0) + (m.output_tokens ?? 0)),
          cost: m.cost ?? 0,
          success_rate: m.success_rate !== undefined
            ? (m.success_rate > 1 ? m.success_rate / 100 : m.success_rate)
            : 0,
        }));
      }

      if (dashboard && Array.isArray(analytics?.timeline)) {
        // 后端只返回有数据的桶，补零成连续时间轴让波形在稀疏范围（如"昨天"）可见。
        const denseTimeline = buildDenseTimeline(analytics.timeline, fromMs, toMs);
        const totalCalls = denseTimeline.reduce((sum: number, point: any) => sum + (point.calls ?? 0), 0);
        const totalTokens = denseTimeline.reduce((sum: number, point: any) => sum + (point.tokens ?? point.total_tokens ?? 0), 0);
        dashboard.traffic_timeline = denseTimeline.map((point: any) => ({
          bucket_ms: point.bucket_ms,
          label: point.label,
          calls: point.calls ?? 0,
          tokens: point.tokens ?? point.total_tokens ?? 0,
          success: point.success ?? 0,
          failure: point.failure ?? 0,
          calls_share: totalCalls > 0 ? (point.calls ?? 0) / totalCalls : 0,
          tokens_share: totalTokens > 0 ? (point.tokens ?? point.total_tokens ?? 0) / totalTokens : 0,
          failure_rate: point.failure_rate ?? ((point.calls ?? 0) > 0 ? (point.failure ?? 0) / point.calls : 0),
        }));
      }

      const enrichedCredentials = rawAuthFiles.map(enrichCredential);
      const credentialCounts = computeCredentialMetrics(rawAuthFiles);
      const accountRows = buildAccountMonitoringRows(
        enrichedCredentials,
        finalSnapshots,
        analytics?.account_stats,
        tRef.current('accounts.unknownAccount')
      );

      let fetchError: string | null = null;
      const isAuthError = [authFilesRes, dashRes, snapsRes].some(
        (r) => r.status === 'rejected' && ((r.reason as any)?.response?.status === 401 || (r.reason as any)?.status === 401)
      );
      if (isAuthError) {
        fetchError = tRef.current('errors.authFailed');
      } else if (healthRes.status === 'rejected' && authFilesRes.status === 'rejected') {
        fetchError = tRef.current('errors.networkFailed');
      }

      setData({
        health,
        collectorStatus,
        credentials: enrichedCredentials,
        credentialCounts,
        accountRows,
        dashboard,
        snapshots: finalSnapshots,
        modelPrices:
          pricesRes.status === 'fulfilled' && pricesRes.value
            ? pricesRes.value
            : {},
        isLoading: false,
        isRefreshing: false,
        lastUpdated: new Date(),
        error: fetchError,
      });

      isFirstLoad.current = false;
    } catch (err: any) {
      if (currentReqId !== reqIdRef.current) return;
      setData((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: err.message || tRef.current('errors.loadFailed'),
      }));
    }
  }, [timeRange, customStart, customEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    ...data,
    refresh: loadData,
  };
}
