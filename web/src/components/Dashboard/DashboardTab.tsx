import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  DashboardSummaryResponse,
  CollectorStatus,
} from '@/types/dashboard';
import {
  TrendingUp,
  PieChart,
  Layers,
  Server,
} from 'lucide-react';
import { Badge } from '@/components/Common/Badge';
import { useTranslation } from '@/i18n';
import { buildTokenMixSegments, TokenMixSegmentKey } from '@/services/tokenMix';

interface DashboardTabProps {
  dashboard: DashboardSummaryResponse | null;
  collectorStatus: CollectorStatus | null;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  dashboard,
  collectorStatus,
}) => {
  const { t } = useTranslation();

  // 1. 流量时序面积图配置 (过滤未来时间轴)
  const trafficChartOption = useMemo(() => {
    if (!dashboard?.traffic_timeline || dashboard.traffic_timeline.length === 0) {
      return {};
    }

    const nowMs = Date.now();
    const validTimeline = dashboard.traffic_timeline.filter(
      (point) => point.bucket_ms <= nowMs + 60 * 1000
    );
    const targetList = validTimeline.length > 0 ? validTimeline : dashboard.traffic_timeline.slice(0, 1);

    const times: string[] = [];
    const calls: number[] = [];
    const failures: number[] = [];

    targetList.forEach((point) => {
      const d = new Date(point.bucket_ms);
      times.push(point.label || `${d.getHours().toString().padStart(2, '0')}:${d
        .getMinutes()
        .toString()
        .padStart(2, '0')}`);
      calls.push(point.success);
      failures.push(point.failure);
    });

    const successLabel = t('dashboard.successRequests');
    const failedLabel = t('dashboard.failedRequests');
    // 单点折线在 showSymbol:false 时不可见，稀疏序列必须显示数据点。
    const showSymbol = targetList.length <= 2;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#111827',
        borderColor: '#1E2B45',
        textStyle: { color: '#F3F4F6' },
      },
      legend: {
        data: [successLabel, failedLabel],
        textStyle: { color: '#94A3B8' },
        right: 10,
        top: 0,
      },
      grid: {
        left: '3%',
        right: '3%',
        bottom: '3%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: '#1E2B45' } },
        axisLabel: { color: '#64748B', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#1E2B45', type: 'dashed' } },
        axisLabel: { color: '#64748B', fontSize: 11 },
      },
      series: [
        {
          name: successLabel,
          type: 'line',
          smooth: true,
          showSymbol,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.4)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.0)' },
              ],
            },
          },
          itemStyle: { color: '#3B82F6' },
          data: calls,
        },
        {
          name: failedLabel,
          type: 'line',
          smooth: true,
          showSymbol,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(239, 68, 68, 0.4)' },
                { offset: 1, color: 'rgba(239, 68, 68, 0.0)' },
              ],
            },
          },
          itemStyle: { color: '#EF4444' },
          data: failures,
        },
      ],
    };
  }, [dashboard, t]);

  // 2. Token Mix 环形图配置
  const tokenMixChartOption = useMemo(() => {
    const today = dashboard?.today;
    if (!today) return {};
    // 分段口径与 cpamp 一致：input 扣除 cache、reasoning 从 output 溢出扣减，避免重复计数。
    const segmentLabels: Record<TokenMixSegmentKey, string> = {
      input: t('dashboard.inputTokens'),
      cached: t('dashboard.cachedTokens'),
      output: t('dashboard.outputTokens'),
      reasoning: t('dashboard.reasoningTokens'),
    };
    const segmentColors: Record<TokenMixSegmentKey, string> = {
      input: '#3B82F6',
      cached: '#10B981',
      output: '#F59E0B',
      reasoning: '#8B5CF6',
    };
    const data = buildTokenMixSegments(today)
      .filter((segment) => segment.tokens > 0)
      .map((segment) => ({
        value: segment.tokens,
        name: segmentLabels[segment.key],
        itemStyle: { color: segmentColors[segment.key] },
      }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const val = params.value.toLocaleString();
          return `<div class="font-sans text-xs">
            <span class="text-slate-400">${params.name}:</span>
            <span class="font-bold font-mono text-white ml-1.5">${val}</span>
            <span class="text-blue-400 ml-1">(${params.percent}%)</span>
          </div>`;
        },
        backgroundColor: '#111827',
        borderColor: '#1E2B45',
      },
      legend: {
        orient: 'vertical',
        right: '5%',
        top: 'center',
        textStyle: { color: '#94A3B8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      series: [
        {
          name: t('dashboard.tokenMixTitle'),
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#0F172A',
            borderWidth: 2,
          },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold',
              color: '#F8FAFC',
            },
          },
          labelLine: { show: false },
          data,
        },
      ],
    };
  }, [dashboard, t]);

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(2)}B`;
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return tokens.toString();
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))), sizes.length - 1);
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-5">
      {/* Top Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 24h QPS / Traffic Waveform (2 Cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-800/80 bg-[#111827]/80 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span>{t('dashboard.trafficTitle')}</span>
            </h3>
          </div>
          <div className="h-[260px] w-full">
            <ReactECharts
              option={trafficChartOption}
              notMerge={true}
              style={{ height: '100%', width: '100%' }}
            />
          </div>
        </div>

        {/* Token Mix Composition Donut (1 Col) */}
        <div className="p-5 rounded-2xl border border-slate-800/80 bg-[#111827]/80 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>{t('dashboard.tokenMixTitle')}</span>
            </h3>
          </div>
          <div className="h-[260px] w-full">
            <ReactECharts
              option={tokenMixChartOption}
              notMerge={true}
              style={{ height: '100%', width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* Top Models & Storage Info Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Top Models Table (2 Cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-slate-800/80 bg-[#111827]/80 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>{t('dashboard.topModelsTitle')}</span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-medium bg-slate-900/40">
                <tr>
                  <th className="py-2.5 px-3">{t('dashboard.modelName')}</th>
                  <th className="py-2.5 px-3">{t('dashboard.callsToday')}</th>
                  <th className="py-2.5 px-3">{t('dashboard.tokenThroughput')}</th>
                  <th className="py-2.5 px-3">{t('dashboard.estCost')}</th>
                  <th className="py-2.5 px-3">{t('dashboard.successRate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(dashboard?.top_models_today || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                      {t('dashboard.noModelData')}
                    </td>
                  </tr>
                ) : (
                  (dashboard?.top_models_today || []).map((model, idx) => (
                    <tr key={`${model.model}-${idx}`} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-100 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <span>{model.model}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {(model.calls ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {formatTokens(model.tokens ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        ${(model.cost ?? 0).toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={(model.success_rate ?? 1) >= 0.98 ? 'emerald' : 'amber'}
                          size="sm"
                        >
                          {((model.success_rate ?? 0) * 100).toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Database & Collector Info Widget (1 Col) */}
        <div className="p-5 rounded-2xl border border-slate-800/80 bg-[#111827]/80 shadow-md space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Server className="w-4 h-4 text-purple-400" />
            <span>{t('dashboard.gatewayMetricsTitle')}</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400">{t('dashboard.eventCollector')}</div>
              <Badge variant="emerald" dot size="sm">
                {collectorStatus?.collector?.collector || t('dashboard.running')}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400">{t('dashboard.sqliteDb')}</div>
              <div className="font-mono text-slate-200 font-semibold">
                {formatBytes(collectorStatus?.database?.totalBytes)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400">{t('dashboard.walLog')}</div>
              <div className="font-mono text-slate-200 font-semibold">
                {formatBytes(collectorStatus?.database?.walBytes)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
