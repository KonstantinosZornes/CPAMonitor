import React, { useState, useMemo, useEffect } from 'react';
import { HeaderSnapshotItem } from '@/types/monitoring';
import { ModelPrice } from '@/services/modelPrices';
import { Badge } from '@/components/Common/Badge';
import {
  RealtimeLogRow,
  buildRealtimeLogRows,
} from '@/services/realtimeRowsBuilder';
import { SnapshotDetailModal } from './SnapshotDetailModal';
import {
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from '@/i18n';

interface RealtimeTabProps {
  snapshots: HeaderSnapshotItem[];
  modelPrices: Record<string, ModelPrice>;
}

const formatTokensShort = (num: number) => {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
};

export const RealtimeTab: React.FC<RealtimeTabProps> = ({ snapshots, modelPrices }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '200' | '4xx' | '5xx'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedSnapshot, setSelectedSnapshot] = useState<HeaderSnapshotItem | null>(null);

  // cpamp 同款实时行：按流（账号×Provider×模型）滚动累计调用数/成功率/最近状态模式
  const allRows = useMemo(
    () => buildRealtimeLogRows(snapshots, modelPrices),
    [snapshots, modelPrices]
  );

  // 提取可用 Providers
  const providers = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach((r) => {
      if (r.provider) set.add(r.provider);
    });
    return Array.from(set);
  }, [allRows]);

  // 过滤数据
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      const query = search.toLowerCase().trim();
      if (query) {
        const haystack = [
          r.model,
          r.requestedModel,
          r.resolvedModel,
          r.account,
          r.apiKeyMasked,
          r.snapshot.api_key_hash,
          r.traceId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (providerFilter !== 'all' && r.provider !== providerFilter) {
        return false;
      }

      if (statusFilter === '200' && (r.statusCode < 200 || r.statusCode >= 300)) return false;
      if (statusFilter === '4xx' && (r.statusCode < 400 || r.statusCode >= 500)) return false;
      if (statusFilter === '5xx' && r.statusCode < 500) return false;

      return true;
    });
  }, [allRows, search, statusFilter, providerFilter]);

  // 分页数据
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const formatTime = (ms: number) => {
    if (!ms) return '--';
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '--';
    const Y = d.getFullYear();
    const M = (d.getMonth() + 1).toString().padStart(2, '0');
    const D = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  };

  const formatDuration = (val?: number | null) => {
    if (val === null || val === undefined || isNaN(val) || val <= 0) return '--';
    if (val < 1000) return `${Math.round(val)} ms`;
    const sec = val / 1000;
    return `${sec < 10 ? sec.toFixed(2) : sec.toFixed(1)} s`;
  };

  const formatTps = (val: number | null) => {
    if (val === null || !Number.isFinite(val) || val <= 0) return '--';
    return `${val >= 100 ? val.toFixed(0) : val.toFixed(1)} t/s`;
  };

  const getLatencyTone = (val?: number | null) => {
    if (!val || val <= 0) return 'text-slate-400';
    if (val < 2000) return 'text-emerald-400';
    if (val < 10000) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getSuccessRateTone = (rate: number) => {
    if (rate >= 95) return 'text-emerald-400';
    if (rate >= 85) return 'text-amber-400';
    return 'text-rose-400';
  };

  // "最近状态"列：最近 ≤10 次成败小圆点
  const renderRecentPattern = (pattern: boolean[]) => {
    if (!pattern.length) return <span className="text-slate-600">--</span>;
    return (
      <span className="inline-flex items-center gap-[3px]">
        {pattern.map((ok, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500/80' : 'bg-rose-500'}`}
          />
        ))}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl border border-slate-800/80 bg-[#111827]/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={t('realtime.searchPlaceholder')}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 text-xs">
            <button
              onClick={() => {
                setStatusFilter('all');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('realtime.allStatusCodes')}
            </button>
            <button
              onClick={() => {
                setStatusFilter('200');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === '200'
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2xx
            </button>
            <button
              onClick={() => {
                setStatusFilter('4xx');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === '4xx'
                  ? 'bg-amber-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              4xx
            </button>
            <button
              onClick={() => {
                setStatusFilter('5xx');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === '5xx'
                  ? 'bg-rose-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              5xx
            </button>
          </div>

          {/* Provider Filter */}
          {providers.length > 0 && (
            <select
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">{t('realtime.allProviders')}</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Realtime Table (cpamp 12 列同款) */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#111827]/90 overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-medium">
              <tr>
                <th className="py-2.5 px-3 whitespace-nowrap">{t('realtime.colApiKey')}</th>
                <th className="py-2.5 px-2.5">{t('realtime.colModel')}</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">{t('realtime.colReasoningService')}</th>
                <th className="py-2.5 px-2.5 text-center whitespace-nowrap">{t('realtime.colRecentStatus')}</th>
                <th className="py-2.5 px-2.5 text-center whitespace-nowrap">{t('realtime.colStatus')}</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">{t('realtime.colSuccessRate')}</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">{t('realtime.colCalls')}</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">{t('realtime.colTps')}</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">{t('realtime.colLatency')}</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">{t('realtime.colTime')}</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">{t('realtime.colUsage')}</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('realtime.colCost')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500 font-sans">
                    {t('realtime.emptyText')}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const isSuccess = row.statusCode >= 200 && row.statusCode < 300;
                  // "缓存"展示 cache_hit 总量：codex 流量的命中 token 在 cache_read_tokens，
                  // 只读 cached_tokens 会长期显示 0（成本计算用的是两者之和）。
                  const cacheHitTokens = row.cachedTokens + row.cacheReadTokens;
                  const usageTooltip = t('realtime.usageTooltip', {
                    input: formatTokensShort(row.inputTokens),
                    output: formatTokensShort(row.outputTokens),
                    cached: formatTokensShort(cacheHitTokens),
                    reasoning: formatTokensShort(row.reasoningTokens),
                  });

                  return (
                    <tr
                      key={row.key}
                      onClick={() => setSelectedSnapshot(row.snapshot)}
                      title={row.failSummary || undefined}
                      className={`transition-colors cursor-pointer group ${
                        row.failed ? 'bg-rose-950/20 hover:bg-rose-950/30' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* 1. API Key / 账号 */}
                      <td className="py-2.5 px-3 max-w-[170px]">
                        <div className="flex flex-col gap-0.5">
                          {row.apiKeyMasked ? (
                            <>
                              <span
                                className="text-slate-300 font-medium truncate"
                                title={row.snapshot.api_key_hash}
                              >
                                {row.apiKeyMasked}
                              </span>
                              <span className="text-[10px] text-slate-500 font-sans truncate">
                                {row.account || '--'}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-slate-300 font-sans font-medium truncate">
                                {row.account || '--'}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {(row.provider || 'UNKNOWN').toUpperCase()}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 2. 模型 */}
                      <td className="py-2.5 px-2.5 max-w-[160px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-200 font-sans font-medium truncate">
                            {row.model}
                          </span>
                          {row.requestedModel && row.requestedModel !== row.model && (
                            <span className="text-[10px] text-slate-500 truncate">
                              req: {row.requestedModel}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. 推理/服务 */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-slate-400">
                        {row.reasoningEffort || row.serviceTier ? (
                          <span className="text-[11px]">
                            {[row.reasoningEffort, row.serviceTier].filter(Boolean).join(' · ')}
                          </span>
                        ) : (
                          <span className="text-slate-600">--</span>
                        )}
                      </td>

                      {/* 4. 最近状态（最近 ≤10 次成败模式） */}
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        {renderRecentPattern(row.recentPattern)}
                      </td>

                      {/* 5. 状态 */}
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <Badge
                          variant={isSuccess ? 'emerald' : row.statusCode < 500 ? 'amber' : 'rose'}
                          size="sm"
                        >
                          {isSuccess ? 'OK' : row.statusCode}
                        </Badge>
                      </td>

                      {/* 6. 成功率（按流累计） */}
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        <span className={`font-semibold ${getSuccessRateTone(row.successRate)}`}>
                          {row.successRate.toFixed(1)}%
                        </span>
                      </td>

                      {/* 7. 调用（按流累计） */}
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-slate-300 font-semibold">
                        {row.requestCount.toLocaleString()}
                      </td>

                      {/* 8. 输出 TPS */}
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-slate-300">
                        {formatTps(row.outputTps)}
                      </td>

                      {/* 9. 耗时（首字 / 总耗时） */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5 text-xs font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">{t('realtime.ttftLabel')}</span>
                            <span className="text-slate-300 font-medium">
                              {formatDuration(row.ttftMs)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">{t('realtime.latencyLabel')}</span>
                            <span className={`font-semibold ${getLatencyTone(row.latencyMs)}`}>
                              {formatDuration(row.latencyMs)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 10. 时间 */}
                      <td className="py-2.5 px-2.5 text-slate-400 whitespace-nowrap">
                        {formatTime(row.timestampMs)}
                      </td>

                      {/* 11. 用量（本次调用 token） */}
                      <td
                        className="py-2.5 px-2.5 text-right whitespace-nowrap"
                        title={usageTooltip}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-200 font-semibold">
                            {formatTokensShort(row.totalTokens)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            In {formatTokensShort(row.inputTokens)} · Out {formatTokensShort(row.outputTokens)}
                          </span>
                        </div>
                      </td>

                      {/* 12. 花费（本次调用，按模型单价） */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {row.cost !== null ? (
                          <span className="text-slate-300 font-medium">${row.cost.toFixed(4)}</span>
                        ) : (
                          <span className="text-slate-600" title={t('realtime.noPriceHint')}>
                            --
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              {t('realtime.totalSummary', {
                total: allRows.length,
                shown: filteredRows.length,
              })}
            </span>
            <span>·</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span>
              {t('accounts.pageInfo', {
                current: currentPage,
                total: totalPages,
              })}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot Detail Modal */}
      <SnapshotDetailModal
        snapshot={selectedSnapshot}
        isOpen={Boolean(selectedSnapshot)}
        onClose={() => setSelectedSnapshot(null)}
      />
    </div>
  );
};
