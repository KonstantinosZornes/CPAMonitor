import React from 'react';
import {
  Activity,
  Zap,
  Clock,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { TodayMetrics } from '@/types/dashboard';
import { useTranslation } from '@/i18n';

interface RequestKpiCardsProps {
  today?: TodayMetrics;
}

export const RequestKpiCards: React.FC<RequestKpiCardsProps> = ({ today }) => {
  const { t } = useTranslation();

  if (!today) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 bg-slate-900/60 border border-slate-800 rounded-xl"
          />
        ))}
      </div>
    );
  }

  const formatNumber = (num: number) => num.toLocaleString();

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(2)}B`;
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return tokens.toString();
  };

  const formatLatency = (ms: number | null) => {
    if (ms === null || !Number.isFinite(ms)) return '--';
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
  };

  const successRatePct = (today.success_rate * 100).toFixed(2);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t('requestKpi.todayRequests')}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. 总请求数与成功率 */}
        <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111827]/90 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-400">{t('requestKpi.todayRequests')}</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {formatNumber(today.total_calls)}
            </span>
            <span className="text-xs font-medium text-emerald-400 font-mono">
              {successRatePct}%
            </span>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>
              {t('requestKpi.successFailed', {
                success: formatNumber(today.success_calls),
                failed: formatNumber(today.failure_calls),
              })}
            </span>
          </div>
        </div>

        {/* 2. Token 吞吐量 */}
        <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111827]/90 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-400">{t('requestKpi.todayTokens')}</span>
            <div className="w-6 h-6 rounded-lg bg-blue-950/60 border border-blue-500/30 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {formatTokens(today.total_tokens)}
            </span>
            <span className="text-xs text-slate-400 font-mono">Tokens</span>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2 truncate">
            <span>
              {t('requestKpi.inOutTokens', {
                inTok: formatTokens(today.input_tokens),
                outTok: formatTokens(today.output_tokens),
              })}
            </span>
          </div>
        </div>

        {/* 3. 平均延迟响应耗时 */}
        <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111827]/90 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-400">{t('requestKpi.avgLatency')}</span>
            <div className="w-6 h-6 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {formatLatency(today.average_latency_ms)}
            </span>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>{t('requestKpi.cache')}: {formatTokens(today.cache_read_tokens || 0)}</span>
          </div>
        </div>

        {/* 4. 预估总成本 */}
        <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111827]/90 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-400">{t('requestKpi.todayCost')}</span>
            <div className="w-6 h-6 rounded-lg bg-purple-950/60 border border-purple-500/30 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              ${today.total_cost.toFixed(4)}
            </span>
            <span className="text-xs text-slate-400 font-mono">USD</span>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>{t('requestKpi.modelPricesDesc')}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
