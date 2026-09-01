import type { EnrichedCredential } from '@/types/auth';
import type { HeaderSnapshotItem, AccountMonitoringRow, MonitoringAnalyticsAccountStat } from '@/types/monitoring';

const cleanAccountKey = (key?: string): string => {
  if (!key) return '';
  let s = key.trim().toLowerCase();
  s = s.replace(/^(co|cx|oa|codex|claude|gemini|openai|anthropic):/i, '');
  s = s.replace(/\.json$/i, '');
  return s;
};

const cleanProvider = (provider?: string): string =>
  (provider || 'unknown').trim().toLowerCase() || 'unknown';

const buildAccountKey = (provider: string | undefined, identity: string | undefined): string => {
  const cleanIdentity = cleanAccountKey(identity);
  return cleanIdentity ? `${cleanProvider(provider)}::${cleanIdentity}` : '';
};

export const buildAccountMonitoringRows = (
  credentials: EnrichedCredential[],
  snapshots: HeaderSnapshotItem[],
  accountStats?: MonitoringAnalyticsAccountStat[],
  unknownAccountLabel: string = 'Unknown'
): AccountMonitoringRow[] => {
  const map = new Map<string, AccountMonitoringRow>();
  // null marks an ambiguous alias shared by more than one logical account.
  const indexLookup = new Map<string, string | null>();
  // 时间范围内有真实使用记录的账号 id（analytics 账号统计或范围内快照命中过）。
  const usedKeys = new Set<string>();
  const latencyAcc = new Map<string, { totalMs: number; count: number }>();
  const modelsMap = new Map<string, Set<string>>();
  const hasScopedAnalytics = accountStats !== undefined;
  const hasScopedEvents = snapshots.length > 0;
  const useCredentialFallback = !hasScopedAnalytics && !hasScopedEvents;
  const registerAlias = (alias: string, target: string) => {
    if (!alias) return;
    if (!indexLookup.has(alias)) {
      indexLookup.set(alias, target);
      return;
    }
    if (indexLookup.get(alias) !== target) indexLookup.set(alias, null);
  };

  // 1. 初始化所有受管凭证
  credentials.forEach((c) => {
    const identity = c.account || c.email || c.label || c.name || c.id || '';
    const mainKey = buildAccountKey(c.provider, identity);
    if (!mainKey) return;

    // 计算 recent_requests 中的初始调用量（取最大值，避免累计值与分桶值叠加双倍计算）
    const recent = c.recent_requests || c.recentRequests || [];
    let recentSuccess = 0;
    let recentFailed = 0;
    for (const b of recent) {
      recentSuccess += Number(b.success) || 0;
      recentFailed += Number(b.failed) || 0;
    }
    // 时间范围数据存在时从 0 开始精确聚合；只有两路范围数据都缺失时才兜底使用凭证历史累计值。
    const initialCalls = useCredentialFallback ? Math.max((Number(c.success) || 0) + (Number(c.failed) || 0), recentSuccess + recentFailed) : 0;
    const initialSuccess = useCredentialFallback ? Math.max(Number(c.success) || 0, recentSuccess) : 0;
    const initialFailure = useCredentialFallback ? Math.max(Number(c.failed) || 0, recentFailed) : 0;

    const credAny = c as any;
    const initInTok = useCredentialFallback ? (credAny.input_tokens ?? credAny.tokens?.input_tokens ?? credAny.inputTokens ?? 0) : 0;
    const initOutTok = useCredentialFallback ? (credAny.output_tokens ?? credAny.tokens?.output_tokens ?? credAny.outputTokens ?? 0) : 0;
    const initCacheTok = useCredentialFallback ? (credAny.cached_tokens ?? credAny.cache_read_tokens ?? credAny.tokens?.cached_tokens ?? credAny.cachedTokens ?? 0) : 0;
    const initTotTok = useCredentialFallback ? (credAny.total_tokens ?? credAny.tokens?.total_tokens ?? credAny.totalTokens ?? (initInTok + initOutTok)) : 0;
    const initCost = useCredentialFallback ? (credAny.cost ?? credAny.total_cost ?? credAny.totalCost ?? 0) : 0;

    const row: AccountMonitoringRow = {
      id: mainKey,
      account: c.account || c.email || c.label || c.name,
      name: c.name,
      email: c.email,
      label: c.label,
      provider: c.provider,
      planType: c.planDisplayName,
      status: c.computedStatus,
      statusLabel: c.statusLabel,
      disabled: c.disabled || c.status === 'disabled',
      totalCalls: initialCalls,
      successCalls: initialSuccess,
      failureCalls: initialFailure,
      successRate: initialCalls > 0 ? (initialSuccess / initialCalls) * 100 : 0,
      inputTokens: initInTok,
      outputTokens: initOutTok,
      cachedTokens: initCacheTok,
      totalTokens: initTotTok,
      totalCost: initCost,
      averageLatencyMs: 0,
      quotaUsedPercent: c.primaryUsedPercent,
      models: [],
      lastSeenAtMs: c.updated_at ? new Date(c.updated_at).getTime() : null,
      authIndex: c.auth_index,
    };

    map.set(mainKey, row);

    // 建立多维度全字段索引映射
    const registerKey = (k?: string, provider?: string) => {
      if (!k) return;
      const lower = k.toLowerCase();
      const cleaned = cleanAccountKey(lower);
      registerAlias(lower, mainKey);
      registerAlias(cleaned, mainKey);
      registerAlias(`${cleanProvider(provider)}::${lower}`, mainKey);
      registerAlias(`${cleanProvider(provider)}::${cleaned}`, mainKey);
    };

    registerKey(c.auth_index, c.provider);
    registerKey(c.name, c.provider);
    registerKey(c.account, c.provider);
    registerKey(c.email, c.provider);
    registerKey(c.label, c.provider);
    registerKey(c.id, c.provider);
  });

  const findMatchingKey = (
    authIndex?: string,
    label?: string,
    account?: string,
    file?: string,
    provider?: string
  ): string | undefined => {
    const lookup = (value?: string, scoped = false) => {
      if (!value) return undefined;
      const normalized = cleanAccountKey(value);
      const key = scoped ? `${cleanProvider(provider)}::${normalized}` : normalized;
      return indexLookup.get(key) || undefined;
    };
    const byIndex = lookup(authIndex);
    if (byIndex) return byIndex;
    for (const value of [label, account, file]) {
      const scoped = lookup(value, true);
      if (scoped) return scoped;
    }
    for (const value of [label, account, file]) {
      const unscoped = lookup(value);
      if (unscoped) return unscoped;
    }
    return undefined;
  };

  // 2. 注入从后端 Analytics 接口汇总的精准账户级统计
  if (accountStats && accountStats.length > 0) {
    accountStats.forEach((stat) => {
      let targetKey: string | undefined;
      const authIndices = stat.auth_indices || [];
      for (const idx of authIndices) {
        const matched = indexLookup.get(idx.toLowerCase());
        if (matched) {
          targetKey = matched;
          break;
        }
      }
      if (!targetKey) {
        targetKey = findMatchingKey(
          authIndices[0],
          stat.auth_label_snapshot,
          stat.account_snapshot,
          stat.auth_file_snapshot,
          stat.auth_provider_snapshot
        );
      }

      const statIdentity = stat.auth_label_snapshot || stat.account_snapshot || stat.auth_file_snapshot || unknownAccountLabel;
      const rawKey = targetKey || (stat.id ? `analytics::${stat.id}` : buildAccountKey(stat.auth_provider_snapshot, statIdentity));
      usedKeys.add(rawKey);
      let entry = map.get(rawKey);

      if (!entry) {
        const displayName = stat.auth_label_snapshot || stat.account_snapshot || stat.auth_file_snapshot || unknownAccountLabel;
        entry = {
          id: rawKey,
          account: displayName,
          name: displayName,
          provider: stat.auth_provider_snapshot || 'CODEX',
          planType: 'FREE',
          status: 'available',
          statusLabel: 'Available',
          disabled: false,
          totalCalls: 0,
          successCalls: 0,
          failureCalls: 0,
          successRate: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          totalCost: 0,
          averageLatencyMs: 0,
          quotaUsedPercent: null,
          models: [],
          lastSeenAtMs: stat.last_seen_ms || null,
          authIndex: stat.auth_indices?.[0],
        };
        map.set(rawKey, entry);
      }

      // 范围数据存在时条目初始值为 0，多行 account_stats 命中同一条目（同身份不同
      // 大小写/来源拆分）时累加合并；覆盖会让账号调用/Token/花费少于 analytics 汇总。
      const statCalls = stat.calls || 0;
      const statSuccess = stat.success_calls || 0;
      const statFailure = stat.failure_calls || 0;
      const inTok = stat.input_tokens || 0;
      const outTok = stat.output_tokens || 0;
      const cacheTok = stat.cached_tokens || 0;
      const totTok = stat.total_tokens || (inTok + outTok);
      const cost = stat.cost ?? 0;

      entry.totalCalls += statCalls;
      entry.successCalls += statSuccess;
      entry.failureCalls += statFailure;
      entry.inputTokens += inTok;
      entry.outputTokens += outTok;
      entry.cachedTokens += cacheTok;
      entry.totalTokens += totTok;
      entry.totalCost += cost;

      // 统一行与快照共用 latencyAcc：avg×calls 加权累计，第 4 步统一求均值。
      if (stat.average_latency_ms && stat.average_latency_ms > 0 && statCalls > 0) {
        const acc = latencyAcc.get(rawKey) || { totalMs: 0, count: 0 };
        acc.totalMs += stat.average_latency_ms * statCalls;
        acc.count += statCalls;
        latencyAcc.set(rawKey, acc);
      }
      if (stat.last_seen_ms && (!entry.lastSeenAtMs || stat.last_seen_ms > entry.lastSeenAtMs)) {
        entry.lastSeenAtMs = stat.last_seen_ms;
      }
      if (stat.models && stat.models.length > 0) {
        const modelNames = stat.models.map((m) => m.model);
        entry.models = Array.from(new Set([...entry.models, ...modelNames]));
      }

      // 账号统计行是 provider 隔离的逻辑账号：label/account/file 只注册带 provider
      // 前缀的别名，避免不同 provider 的同名身份经无前缀别名串到同一条目；
      // auth_index 是精确标识，无前缀注册以便快照按索引命中。
      const registerStatAlias = (value?: string, scopedOnly?: boolean) => {
        if (!value) return;
        const cleaned = cleanAccountKey(value);
        const scoped = `${cleanProvider(stat.auth_provider_snapshot)}::${cleaned}`;
        if (!scopedOnly) registerAlias(cleaned, rawKey);
        registerAlias(scoped, rawKey);
      };
      authIndices.forEach((idx) => registerStatAlias(idx));
      registerStatAlias(stat.auth_label_snapshot, true);
      registerStatAlias(stat.account_snapshot, true);
      registerStatAlias(stat.auth_file_snapshot, true);
    });
  }

  // 3. 聚合 Header Snapshots 中的实时请求明细
  snapshots.forEach((snap) => {
    const snapAny = snap as any;
    const targetKey = findMatchingKey(
      snap.auth_index,
      snap.auth_label_snapshot,
      snap.account_snapshot,
      snap.auth_file_snapshot,
      snap.auth_provider_snapshot
    );

    const snapshotIdentity = snap.auth_label_snapshot || snap.account_snapshot || snap.auth_file_snapshot || unknownAccountLabel;
    const rawKey = targetKey || buildAccountKey(snap.auth_provider_snapshot, snapshotIdentity);
    usedKeys.add(rawKey);
    let entry = map.get(rawKey);

    if (!entry) {
      const displayName =
        snap.auth_label_snapshot ||
        snap.account_snapshot ||
        snap.auth_file_snapshot ||
        unknownAccountLabel;

      entry = {
        id: rawKey,
        account: displayName,
        name: displayName,
        provider: snap.auth_provider_snapshot || 'CODEX',
        planType: snap.header_quota_plan_type || 'FREE',
        status: 'available',
        statusLabel: 'Available',
        disabled: false,
        totalCalls: 0,
        successCalls: 0,
        failureCalls: 0,
        successRate: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        averageLatencyMs: 0,
        quotaUsedPercent: snap.header_quota_used_percent ?? null,
        models: [],
        lastSeenAtMs: snap.timestamp_ms,
        authIndex: snap.auth_index,
      };
      map.set(rawKey, entry);
    }

    // 全源兼容 Token 提取
    const inTok =
      snapAny.tokens?.input_tokens ??
      snapAny.input_tokens ??
      snap.response_metadata?.input_tokens ??
      snap.response_metadata?.tokens?.input_tokens ??
      snapAny.usage?.prompt_tokens ??
      snap.response_metadata?.usage?.prompt_tokens ??
      0;

    const outTok =
      snapAny.tokens?.output_tokens ??
      snapAny.output_tokens ??
      snap.response_metadata?.output_tokens ??
      snap.response_metadata?.tokens?.output_tokens ??
      snapAny.usage?.completion_tokens ??
      snap.response_metadata?.usage?.completion_tokens ??
      0;

    const cacheTok =
      snapAny.tokens?.cached_tokens ??
      snapAny.tokens?.cache_read_tokens ??
      snapAny.cached_tokens ??
      snapAny.cache_read_tokens ??
      snap.response_metadata?.cached_tokens ??
      snap.response_metadata?.cache_read_tokens ??
      0;

    const totTok =
      snapAny.tokens?.total_tokens ??
      snapAny.total_tokens ??
      snap.response_metadata?.total_tokens ??
      snap.response_metadata?.tokens?.total_tokens ??
      snapAny.usage?.total_tokens ??
      snap.response_metadata?.usage?.total_tokens ??
      (inTok + outTok);

    const cost =
      snapAny.cost ??
      snapAny.total_cost ??
      snap.response_metadata?.cost ??
      snap.response_metadata?.total_cost ??
      0;

    if (!hasScopedAnalytics) {
      entry.totalCalls += 1;
      const statusCode = snap.response_metadata?.status_code ?? 200;
      if (statusCode >= 200 && statusCode < 400) entry.successCalls += 1;
      else entry.failureCalls += 1;
    }

    if (!hasScopedAnalytics && (inTok > 0 || outTok > 0 || totTok > 0)) {
      entry.inputTokens += inTok;
      entry.outputTokens += outTok;
      entry.cachedTokens += cacheTok;
      entry.totalTokens += totTok;
      entry.totalCost += cost;
    }

    // 延迟累加
    const latency =
      snap.latency_ms ??
      snap.duration_ms ??
      snap.response_metadata?.latency_ms ??
      (snap.response_metadata as any)?.duration_ms;
    if (latency && latency > 0) {
      const acc = latencyAcc.get(rawKey) || { totalMs: 0, count: 0 };
      acc.totalMs += latency;
      acc.count += 1;
      latencyAcc.set(rawKey, acc);
    }

    // 记录模型
    const model = snap.model || snap.requested_model || snap.resolved_model || snap.analytics_model;
    if (model) {
      const s = modelsMap.get(rawKey) || new Set<string>();
      s.add(model);
      modelsMap.set(rawKey, s);
    }

    if (!entry.lastSeenAtMs || snap.timestamp_ms > entry.lastSeenAtMs) {
      entry.lastSeenAtMs = snap.timestamp_ms;
    }

    if (snap.header_quota_used_percent !== undefined && snap.header_quota_used_percent !== null) {
      entry.quotaUsedPercent = snap.header_quota_used_percent;
    }
  });

  // 4. 整合平均延迟与成功率
  map.forEach((row, key) => {
    if (row.totalCalls > 0) {
      row.successRate = (row.successCalls / row.totalCalls) * 100;
    }

    const acc = latencyAcc.get(key);
    if (acc && acc.count > 0 && row.averageLatencyMs === 0) {
      row.averageLatencyMs = Math.round(acc.totalMs / acc.count);
    }
    const models = modelsMap.get(key);
    if (models) {
      row.models = Array.from(new Set([...row.models, ...Array.from(models)]));
    }
  });

  // 5. 与 CPAMP 监控中心一致：账号列表由时间范围内的使用记录聚合而成，范围内没有
  // 请求的账号不显示。只有两路范围数据（analytics 统计、范围内快照）都缺失、无法
  // 判定范围使用时，才保留全部凭证兜底展示历史累计值。
  const rows = Array.from(map.values());
  if (hasScopedAnalytics || hasScopedEvents) {
    return rows.filter((row) => usedKeys.has(row.id));
  }
  return rows;
};
