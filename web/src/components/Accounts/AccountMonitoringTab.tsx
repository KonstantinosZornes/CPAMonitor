import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import {
  AccountMonitoringRow,
  AccountSortKey,
  AccountSortState,
  DEFAULT_ACCOUNT_SORT,
} from '@/types/monitoring';
import { CredentialStatusType } from '@/types/auth';
import { Badge } from '@/components/Common/Badge';
import { Modal } from '@/components/Common/Modal';
import { useTranslation } from '@/i18n';

interface AccountMonitoringTabProps {
  rows: AccountMonitoringRow[];
  activeStatusFilter?: CredentialStatusType | 'all';
  onSelectStatusFilter?: (status: CredentialStatusType | 'all') => void;
}

// cpamp 风格排序值计算
const getAccountSortValue = (row: AccountMonitoringRow, key: AccountSortKey): number => {
  switch (key) {
    case 'totalCalls':
      return row.totalCalls ?? 0;
    case 'successCalls':
      return row.successCalls ?? 0;
    case 'failureCalls':
      return row.failureCalls ?? 0;
    case 'successRate':
      return row.successRate ?? 0;
    case 'totalTokens':
      return row.totalTokens ?? 0;
    case 'inputTokens':
      return row.inputTokens ?? 0;
    case 'outputTokens':
      return row.outputTokens ?? 0;
    case 'cachedTokens':
      return row.cachedTokens ?? 0;
    case 'totalCost':
      return row.totalCost ?? 0;
    case 'lastSeenAt':
    default:
      return row.lastSeenAtMs || 0;
  }
};

// cpamp 风格同值仲裁逻辑 (Tie-breaker)
const compareAccountRowsByDefault = (
  left: AccountMonitoringRow,
  right: AccountMonitoringRow
): number =>
  (right.lastSeenAtMs || 0) - (left.lastSeenAtMs || 0) ||
  (right.totalCalls || 0) - (left.totalCalls || 0) ||
  (right.totalCost || 0) - (left.totalCost || 0) ||
  (left.account || '').localeCompare(right.account || '');

// cpamp 风格全表排序
const sortAccountRows = (
  rows: AccountMonitoringRow[],
  sortState: AccountSortState = DEFAULT_ACCOUNT_SORT
): AccountMonitoringRow[] => {
  const directionFactor = sortState.direction === 'desc' ? -1 : 1;

  return [...rows].sort((left, right) => {
    const valueDiff =
      getAccountSortValue(left, sortState.key) - getAccountSortValue(right, sortState.key);
    if (valueDiff !== 0) {
      return valueDiff * directionFactor;
    }

    return compareAccountRowsByDefault(left, right);
  });
};

export const AccountMonitoringTab: React.FC<AccountMonitoringTabProps> = ({
  rows,
  activeStatusFilter,
  onSelectStatusFilter,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState<CredentialStatusType | 'all'>('all');
  const statusFilter = activeStatusFilter !== undefined ? activeStatusFilter : internalStatusFilter;
  const setStatusFilter = (st: CredentialStatusType | 'all') => {
    if (onSelectStatusFilter) onSelectStatusFilter(st);
    setInternalStatusFilter(st);
  };
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  // cpamp 默认排序状态: 最近活跃时间 (lastSeenAt) 降序
  const [accountSort, setAccountSort] = useState<AccountSortState>(DEFAULT_ACCOUNT_SORT);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 账号详情弹窗
  const [selectedAccount, setSelectedAccount] = useState<AccountMonitoringRow | null>(null);

  // 提取可用 Providers
  const providers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.provider) set.add(r.provider);
    });
    return Array.from(set);
  }, [rows]);

  // 1. 过滤
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesAccount = (r.account || '').toLowerCase().includes(query);
        const matchesName = (r.name || '').toLowerCase().includes(query);
        const matchesLabel = (r.label || '').toLowerCase().includes(query);
        const matchesProvider = (r.provider || '').toLowerCase().includes(query);
        if (!matchesAccount && !matchesName && !matchesLabel && !matchesProvider) {
          return false;
        }
      }

      if (statusFilter !== 'all' && (statusFilter as string) !== 'total' && r.status !== statusFilter) {
        return false;
      }

      if (providerFilter !== 'all' && (r.provider || '').toLowerCase() !== providerFilter.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [rows, searchTerm, statusFilter, providerFilter]);

  // 2. 按照 cpamp 排序算法执行排序
  const sortedRows = useMemo(() => {
    return sortAccountRows(filteredRows, accountSort);
  }, [filteredRows, accountSort]);

  // 3. 分页切片
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  // cpamp 点击表头排序处理
  const handleAccountSort = (key: AccountSortKey) => {
    setCurrentPage(1);
    setAccountSort((previous) =>
      previous.key === key
        ? {
            key,
            direction: previous.direction === 'desc' ? 'asc' : 'desc',
          }
        : {
            key,
            direction: 'desc',
          }
    );
  };

  // 下拉框切换排序键
  const handleSortKeyChange = (key: AccountSortKey) => {
    setCurrentPage(1);
    setAccountSort((previous) =>
      previous.key === key
        ? previous
        : {
            key,
            direction: 'desc',
          }
    );
  };

  // 数字格式化工具
  const formatNum = (num?: number) => (num ?? 0).toLocaleString();
  const formatTokens = (num?: number) => {
    const val = num ?? 0;
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
    return val.toString();
  };
  const formatCost = (num?: number) => `$${(num ?? 0).toFixed(4)}`;
  const formatTime = (ms: number | null) => {
    if (!ms) return '--';
    const date = new Date(ms);
    if (isNaN(date.getTime())) return '--';
    const Y = date.getFullYear();
    const M = (date.getMonth() + 1).toString().padStart(2, '0');
    const D = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  };

  // 渲染表头排序指示器 (cpamp 风格 Chevron)
  const renderSortIndicator = (key: AccountSortKey) => {
    const isActive = accountSort.key === key;
    if (!isActive) return null;
    return accountSort.direction === 'desc' ? (
      <ChevronDown className="w-3.5 h-3.5 text-blue-400 font-bold ml-1" />
    ) : (
      <ChevronUp className="w-3.5 h-3.5 text-blue-400 font-bold ml-1" />
    );
  };

  const getStatusBadge = (status: CredentialStatusType) => {
    switch (status) {
      case 'available':
        return <Badge variant="emerald">{t('statusCards.available')}</Badge>;
      case 'quotaRisk':
        return <Badge variant="amber">{t('statusCards.quotaRisk')}</Badge>;
      case 'needsAttention':
        return <Badge variant="rose">{t('statusCards.needsAttention')}</Badge>;
      case 'disabled':
        return <Badge variant="gray">{t('statusCards.disabled')}</Badge>;
      default:
        return <Badge variant="purple">{t('statusCards.unconfirmed')}</Badge>;
    }
  };

  // cpamp 表格列定义 (包含 key, label, sortKey)
  const columns: Array<{
    key: string;
    label: string;
    sortKey?: AccountSortKey;
    align?: 'left' | 'right';
  }> = [
    { key: 'account', label: t('accounts.colAccount'), align: 'left' },
    { key: 'status', label: t('accounts.colStatus'), align: 'left' },
    { key: 'total-calls', label: t('accounts.colCalls'), sortKey: 'totalCalls', align: 'right' },
    { key: 'success-calls', label: t('accounts.colSuccess'), sortKey: 'successCalls', align: 'right' },
    { key: 'failure-calls', label: t('accounts.colFailed'), sortKey: 'failureCalls', align: 'right' },
    { key: 'success-rate', label: t('accounts.colRate'), sortKey: 'successRate', align: 'right' },
    { key: 'total-tokens', label: t('accounts.colToken'), sortKey: 'totalTokens', align: 'right' },
    { key: 'estimated-cost', label: t('accounts.colCost'), sortKey: 'totalCost', align: 'right' },
    { key: 'latest-request-time', label: t('accounts.colLastActive'), sortKey: 'lastSeenAt', align: 'right' },
  ];

  return (
    <div className="space-y-4">
      {/* 顶部工具栏与筛选器 (cpamp 风格) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 p-4 rounded-xl bg-[#0D121F] border border-slate-800">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* 搜索框 */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t('accounts.searchPlaceholder')}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg pl-9 pr-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* 状态过滤 */}
          <select
            value={statusFilter === 'total' ? 'all' : statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-slate-900/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">{t('accounts.allStatuses')}</option>
            <option value="available">🟢 {t('statusCards.available')}</option>
            <option value="quotaRisk">🟠 {t('statusCards.quotaRisk')}</option>
            <option value="needsAttention">🔴 {t('statusCards.needsAttention')}</option>
            <option value="disabled">⚪ {t('statusCards.disabled')}</option>
            <option value="unconfirmed">🟣 {t('statusCards.unconfirmed')}</option>
          </select>

          {/* Provider 过滤 */}
          {providers.length > 0 && (
            <select
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-900/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">{t('accounts.allProviders')}</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          )}

          {/* cpamp 排序选择器 */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <span className="text-slate-400">{t('accounts.sortBy')}:</span>
            <select
              value={accountSort.key}
              onChange={(e) => handleSortKeyChange(e.target.value as AccountSortKey)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="lastSeenAt" className="bg-slate-900">{t('accounts.sortRecentActive')}</option>
              <option value="totalCalls" className="bg-slate-900">{t('accounts.sortCallsDesc')}</option>
              <option value="successCalls" className="bg-slate-900">{t('accounts.colSuccess')}</option>
              <option value="failureCalls" className="bg-slate-900">{t('accounts.colFailed')}</option>
              <option value="successRate" className="bg-slate-900">{t('accounts.sortSuccessRateDesc')}</option>
              <option value="totalTokens" className="bg-slate-900">{t('accounts.sortTokensDesc')}</option>
              <option value="totalCost" className="bg-slate-900">{t('accounts.sortCostDesc')}</option>
              <option value="inputTokens" className="bg-slate-900">{t('dashboard.inputTokens')}</option>
              <option value="outputTokens" className="bg-slate-900">{t('dashboard.outputTokens')}</option>
              <option value="cachedTokens" className="bg-slate-900">{t('dashboard.cachedTokens')}</option>
            </select>
          </div>
        </div>

        {/* 视图切换与总数 */}
        <div className="flex items-center gap-3 self-end lg:self-auto">
          <span className="text-xs text-slate-400 font-mono">
            {t('accounts.totalSummary', {
              total: rows.length,
              shown: filteredRows.length,
            })}
          </span>

          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t('accounts.viewTable')}
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t('accounts.viewCard')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 视图 1: 严格按照 cpamp 规范的排序列数据表格 */}
      {viewMode === 'table' && (
        <div className="rounded-xl border border-slate-800 bg-[#0D121F] overflow-hidden shadow-xl">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  {columns.map((col) => {
                    const isSortable = Boolean(col.sortKey);
                    const isActive = isSortable && accountSort.key === col.sortKey;

                    if (!isSortable) {
                      return (
                        <th key={col.key} className="py-3 px-4 select-none">
                          <span>{col.label}</span>
                        </th>
                      );
                    }

                    return (
                      <th
                        key={col.key}
                        onClick={() => col.sortKey && handleAccountSort(col.sortKey)}
                        className={`py-3 px-4 cursor-pointer transition-colors group select-none ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        } ${isActive ? 'bg-blue-950/30' : 'hover:bg-slate-800/60'}`}
                      >
                        <div
                          className={`inline-flex items-center gap-0.5 ${
                            col.align === 'right' ? 'justify-end w-full' : 'justify-start'
                          }`}
                        >
                          <span
                            className={`transition-colors ${
                              isActive ? 'text-blue-400 font-semibold' : 'text-slate-400 group-hover:text-slate-200'
                            }`}
                          >
                            {col.label}
                          </span>
                          {col.sortKey && renderSortIndicator(col.sortKey)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60 font-mono">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center text-slate-400 font-sans">
                      {t('accounts.emptyText')}
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedAccount(row)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* 1. 账号 */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                            <span className="font-bold uppercase text-[10px] text-blue-400">
                              {(row.provider || 'CP').substring(0, 2)}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium text-slate-200 group-hover:text-blue-300 transition-colors font-mono">
                              {row.account}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <span>{(row.provider || 'UNKNOWN').toUpperCase()}</span>
                              <span>·</span>
                              <span>{row.planType}</span>
                              {row.quotaUsedPercent != null && (
                                <>
                                  <span>·</span>
                                  <span
                                    className={
                                      row.quotaUsedPercent >= 80 ? 'text-amber-400 font-medium' : 'text-slate-400'
                                    }
                                  >
                                    Used {row.quotaUsedPercent}%
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. 状态 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(row.status)}
                      </td>

                      {/* 3. 调用 (总数) */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-200">
                        {formatNum(row.totalCalls)}
                      </td>

                      {/* 4. 成功 */}
                      <td className="py-3 px-4 text-right font-mono text-emerald-400">
                        {formatNum(row.successCalls)}
                      </td>

                      {/* 5. 失败 */}
                      <td className="py-3 px-4 text-right font-mono">
                        {row.failureCalls > 0 ? (
                          <span className="text-rose-400 font-semibold">{formatNum(row.failureCalls)}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* 6. 成功率 */}
                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            (row.successRate ?? 0) >= 99
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                              : (row.successRate ?? 0) >= 90
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {(row.successRate ?? 0).toFixed(2)}%
                        </span>
                      </td>

                      {/* 7. Token */}
                      <td className="py-3 px-4 text-right font-mono">
                        <div className="text-slate-200 font-semibold">{formatTokens(row.totalTokens)}</div>
                        <div className="text-[10px] text-slate-400">
                          In: {formatTokens(row.inputTokens)} · Out: {formatTokens(row.outputTokens)}
                        </div>
                      </td>

                      {/* 8. 花费 */}
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-300">
                        {formatCost(row.totalCost)}
                      </td>

                      {/* 9. 最近请求时间 */}
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {formatTime(row.lastSeenAtMs)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 视图 2: 卡片视图 */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {paginatedRows.map((row) => (
            <div
              key={row.id}
              onClick={() => setSelectedAccount(row)}
              className="p-4 rounded-xl border border-slate-800 bg-[#0D121F] hover:border-slate-700 transition-all cursor-pointer space-y-3 shadow-sm hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <span className="font-bold uppercase text-xs text-blue-400">
                      {(row.provider || 'CP').substring(0, 2)}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-200 font-mono line-clamp-1">
                      {row.account}
                    </div>
                    <div className="text-xs text-slate-400">
                      {(row.provider || 'UNKNOWN').toUpperCase()} · {row.planType}
                    </div>
                  </div>
                </div>
                {getStatusBadge(row.status)}
              </div>

              {/* 核心指标统计网格 */}
              <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-800/80 text-center font-mono">
                <div>
                  <div className="text-[10px] text-slate-400">{t('accounts.colCalls')}</div>
                  <div className="font-bold text-slate-200">{formatNum(row.totalCalls)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">{t('accounts.colRate')}</div>
                  <div className="font-bold text-emerald-400">{(row.successRate ?? 0).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">{t('accounts.colToken')}</div>
                  <div className="font-bold text-slate-200">{formatTokens(row.totalTokens)}</div>
                </div>
              </div>

              {/* 底部活跃时间与花费 */}
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono pt-1">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{formatTime(row.lastSeenAtMs)}</span>
                </div>
                <div className="font-semibold text-slate-200">{formatCost(row.totalCost)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页控制栏 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3.5 bg-[#0D121F] border border-slate-800 rounded-xl text-xs">
          <span className="text-slate-400">
            {t('accounts.pageInfo', {
              current: currentPage,
              total: totalPages,
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{t('accounts.prevPage')}</span>
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>{t('accounts.nextPage')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 账号详情抽屉 */}
      {selectedAccount && (
        <Modal
          isOpen={Boolean(selectedAccount)}
          onClose={() => setSelectedAccount(null)}
          title={
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <span className="font-mono text-sm">{selectedAccount.account}</span>
            </div>
          }
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 text-xs font-mono">
            <div className="p-3 bg-slate-900/60 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">{t('accounts.colStatus')}:</span>
                {getStatusBadge(selectedAccount.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t('realtime.colProvider')}:</span>
                <span className="text-slate-200">{(selectedAccount.provider || 'UNKNOWN').toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Plan Type:</span>
                <span className="text-slate-200">{selectedAccount.planType}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-900/60 rounded-xl space-y-1">
                <div className="text-slate-400">{t('accounts.colCalls')}</div>
                <div className="text-lg font-bold text-slate-100">{formatNum(selectedAccount.totalCalls)}</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl space-y-1">
                <div className="text-slate-400">{t('accounts.colRate')}</div>
                <div className="text-lg font-bold text-emerald-400">{(selectedAccount.successRate ?? 0).toFixed(2)}%</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl space-y-1">
                <div className="text-slate-400">{t('accounts.colToken')}</div>
                <div className="text-lg font-bold text-slate-100">{formatTokens(selectedAccount.totalTokens)}</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl space-y-1">
                <div className="text-slate-400">{t('accounts.colCost')}</div>
                <div className="text-lg font-bold text-slate-100">{formatCost(selectedAccount.totalCost)}</div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
