import type {
  AuthFileItem,
  CredentialCounts,
  CredentialStatusType,
  EnrichedCredential,
} from '@/types/auth';

const parsePercent = (val: unknown): number | null => {
  if (val === undefined || val === null || val === '') return null;
  const parsed = typeof val === 'number' ? val : parseFloat(String(val));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 判定凭证的 6 态分类
 */
export const classifyCredential = (file: AuthFileItem): CredentialStatusType => {
  if (!file) return 'unconfirmed';

  // 1. 已禁用 (Disabled)
  const isDisabled =
    file.disabled === true ||
    file.status === 'disabled' ||
    file.status === 'inactive';
  if (isDisabled) {
    return 'disabled';
  }

  // 2. 需要处理 (Needs Attention: 重新认证、异常或待处理操作)
  const statusMsg = typeof file.status_message === 'string' ? file.status_message.toLowerCase() : '';
  const hasError =
    file.status === 'error' ||
    file.status === 'problem' ||
    statusMsg.includes('error') ||
    statusMsg.includes('fail') ||
    statusMsg.includes('invalid') ||
    statusMsg.includes('unauthorized') ||
    statusMsg.includes('reauth');
  if (hasError) {
    return 'needsAttention';
  }

  // 3. 额度风险 (Quota Risk: 低额度、部分可用、已耗尽或冷却中)
  const quota = file.quota || {};
  const signals = quota.signals || {};
  
  // 检查已用百分比 Primary Used Percent
  const primaryVal = parsePercent(signals['X-Codex-Primary-Used-Percent']);
  if (primaryVal !== null && primaryVal >= 80) {
    return 'quotaRisk';
  }

  const secondaryVal = parsePercent(signals['X-Codex-Secondary-Used-Percent']);
  if (secondaryVal !== null && secondaryVal >= 80) {
    return 'quotaRisk';
  }

  // unavailable 是网关侧的瞬时不可用标记（额度耗尽 / 冷却中）。
  // X-Codex-Credits-Has-Credits=false 仅表示账户没有按量付费美元余额，订阅套餐账号常态如此，
  // 与主/次窗口套餐额度无关（上游 cpamp 仅将其用于展示），不能据此判定额度风险。
  if (file.unavailable === true) {
    return 'quotaRisk';
  }

  // 4. 正常可用 (Available)：'active' 是网关生命周期管理器对"有效且可执行"的权威判定，
  // 新启用但还没有请求/额度观测的账号同样可用，不应降级为待确认。
  if (file.status === 'active') {
    return 'available';
  }

  // 5. 状态待确认 (Unconfirmed: unknown / pending / refreshing 等缺少有效状态判定的凭证)
  return 'unconfirmed';
};

/**
 * 格式化单条凭证数据
 */
export const enrichCredential = (file: AuthFileItem): EnrichedCredential => {
  const computedStatus = classifyCredential(file);

  const statusLabels: Record<CredentialStatusType, string> = {
    total: 'Total',
    available: 'Available',
    needsAttention: 'Needs Attention',
    quotaRisk: 'Quota Risk',
    disabled: 'Disabled',
    unconfirmed: 'Unconfirmed',
  };

  const signals = file.quota?.signals || {};
  const primaryUsed = parsePercent(signals['X-Codex-Primary-Used-Percent']);
  const secondaryUsed = parsePercent(signals['X-Codex-Secondary-Used-Percent']);

  const planDisplayName =
    signals['X-Codex-Plan-Type'] ||
    file.id_token?.plan_type ||
    file.type ||
    'Standard';

  const recent = file.recent_requests || file.recentRequests || [];
  let totalRecent = 0;
  let successRecent = 0;
  for (const b of recent) {
    totalRecent += (Number(b.success) || 0) + (Number(b.failed) || 0);
    successRecent += Number(b.success) || 0;
  }

  const recentSuccessRate = totalRecent > 0 ? (successRecent / totalRecent) * 100 : null;

  return {
    ...file,
    computedStatus,
    statusLabel: statusLabels[computedStatus] || 'Unknown',
    primaryUsedPercent: primaryUsed,
    secondaryUsedPercent: secondaryUsed,
    planDisplayName: String(planDisplayName).toUpperCase(),
    totalRecentRequests: totalRecent,
    recentSuccessRate,
  };
};

/**
 * 计算 6 态指标统计
 */
export const computeCredentialMetrics = (files?: AuthFileItem[]): CredentialCounts => {
  const safeFiles = Array.isArray(files) ? files : [];
  const counts: CredentialCounts = {
    total: safeFiles.length,
    available: 0,
    needsAttention: 0,
    quotaRisk: 0,
    disabled: 0,
    unconfirmed: 0,
  };

  for (const f of safeFiles) {
    const status = classifyCredential(f);
    counts[status] = (counts[status] || 0) + 1;
  }

  return counts;
};
