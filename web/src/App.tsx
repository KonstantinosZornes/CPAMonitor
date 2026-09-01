import React, { useState } from 'react';
import { useMonitorData } from '@/hooks/useMonitorData';
import { usePolling } from '@/hooks/usePolling';
import { getStoredSettings, saveStoredSettings, isConfigured, TimeRangeType } from '@/services/storage';
import { Header } from '@/components/Header/Header';
import { CredentialStatusCards } from '@/components/Metrics/CredentialStatusCards';
import { RequestKpiCards } from '@/components/Metrics/RequestKpiCards';
import { TabNav, ActiveTabType } from '@/components/Tabs/TabNav';
import { DashboardTab } from '@/components/Dashboard/DashboardTab';
import { AccountMonitoringTab } from '@/components/Accounts/AccountMonitoringTab';
import { RealtimeTab } from '@/components/Realtime/RealtimeTab';
import { ConnectionForm } from '@/components/Header/ConnectionForm';
import { CredentialStatusType } from '@/types/auth';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n';

export function App() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(getStoredSettings());
  const [timeRange, setTimeRange] = useState<TimeRangeType>(settings.timeRange || 'today');
  const [customStart, setCustomStart] = useState<string>(settings.customStartDate || '');
  const [customEnd, setCustomEnd] = useState<string>(settings.customEndDate || '');
  const [activeTab, setActiveTab] = useState<ActiveTabType>('dashboard');
  const [activeStatusFilter, setActiveStatusFilter] = useState<CredentialStatusType | 'all'>('all');
  const [showSettings, setShowSettings] = useState(false);

  const configured = isConfigured(settings);

  const {
    health,
    collectorStatus,
    credentialCounts,
    accountRows,
    dashboard,
    snapshots,
    modelPrices,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refresh,
  } = useMonitorData(timeRange, customStart, customEnd);

  const { progress, triggerNow } = usePolling({
    intervalSeconds: settings.autoRefreshInterval,
    onPoll: () => refresh(timeRange, customStart, customEnd),
    enabled: configured && !showSettings,
  });

  const handleIntervalChange = (interval: number) => {
    const updated = saveStoredSettings({ autoRefreshInterval: interval });
    setSettings(updated);
  };

  const handleTimeRangeChange = (range: TimeRangeType, start?: string, end?: string) => {
    setTimeRange(range);
    if (start !== undefined) setCustomStart(start);
    if (end !== undefined) setCustomEnd(end);
    const updated = saveStoredSettings({
      timeRange: range,
      customStartDate: start !== undefined ? start : customStart,
      customEndDate: end !== undefined ? end : customEnd,
    });
    setSettings(updated);
  };

  const handleSettingsSaved = () => {
    const updated = getStoredSettings();
    setSettings(updated);
    setShowSettings(false);
    refresh();
  };

  const handleSelectStatusCard = (status: CredentialStatusType | 'all') => {
    setActiveStatusFilter(status === 'total' ? 'all' : status);
    setActiveTab('accounts'); // 点击卡片自动跳转到账号监控并联动筛选对应状态账号
  };

  const isHealthy = Boolean(health?.ok);

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* 1. Global Header */}
      <Header
        isConfigured={configured}
        isHealthy={isHealthy}
        isRefreshing={isRefreshing || isLoading}
        lastUpdated={lastUpdated}
        refreshProgress={progress}
        autoRefreshInterval={settings.autoRefreshInterval}
        timeRange={timeRange}
        customStartDate={customStart}
        customEndDate={customEnd}
        isSettingsOpen={showSettings}
        onIntervalChange={handleIntervalChange}
        onTimeRangeChange={handleTimeRangeChange}
        onRefreshManual={triggerNow}
        onToggleSettings={() => setShowSettings((prev) => !prev)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 space-y-6">
        {/* 首次设置 / 设置界面 (100% 统一卡片与位置，零弹窗遮挡) */}
        {!configured || showSettings ? (
          <div className="max-w-xl mx-auto my-8 p-6 rounded-2xl bg-[#0D121F] border border-slate-800 shadow-2xl">
            <ConnectionForm
              title={configured ? t('connection.settingsTitle') : t('connection.firstTitle')}
              subtitle={configured ? t('connection.settingsSubtitle') : t('connection.firstSubtitle')}
              showHeader={true}
              showCancel={configured}
              onCancel={() => setShowSettings(false)}
              onSaved={handleSettingsSaved}
            />
          </div>
        ) : (
          <>
            {/* Error Alert Banner if connection failed */}
            {error && (
              <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-sm flex items-start gap-3 shadow-lg">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">
                  <div className="font-semibold text-rose-200">{t('connection.serviceErrorTitle')}</div>
                  <div className="text-xs text-rose-300/90 mt-0.5">{error}</div>
                </div>
                <button
                  onClick={() => refresh()}
                  className="px-3 py-1 bg-rose-900/80 hover:bg-rose-800 border border-rose-500/40 rounded-lg text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  {t('connection.retry')}
                </button>
              </div>
            )}

            {/* 2. Top Summary KPI Cards (Double Row) */}
            <div className="space-y-5">
              {/* Row 1: 凭证 6 态概览卡片 (点击联动账号监控筛选) */}
              <CredentialStatusCards
                counts={credentialCounts}
                activeStatus={activeStatusFilter}
                onSelectStatus={handleSelectStatusCard}
              />

              {/* Row 2: 请求监控今日流量核心 KPI */}
              <RequestKpiCards today={dashboard?.today} />
            </div>

            {/* 3. Tab Workspace Navigation (三大核心工作区) */}
            <div className="space-y-5">
              <TabNav
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                accountCount={accountRows.length}
                realtimeCount={snapshots.length}
              />

              {/* Loading Skeleton during initial load */}
              {isLoading && (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                  <div className="text-sm font-medium">{t('dashboard.syncing')}</div>
                </div>
              )}

              {/* Tab 1: 📊 监控大盘与趋势 (默认首个 Tab) */}
              {!isLoading && activeTab === 'dashboard' && (
                <DashboardTab
                  dashboard={dashboard}
                  collectorStatus={collectorStatus}
                />
              )}

              {/* Tab 2: 👥 账号监控 (含 账号/状态/调用/成功/失败/成功率/Token/花费/排序) */}
              {!isLoading && activeTab === 'accounts' && (
                <AccountMonitoringTab
                  rows={accountRows}
                  activeStatusFilter={activeStatusFilter}
                  onSelectStatusFilter={setActiveStatusFilter}
                />
              )}

              {/* Tab 3: ⚡ 实时请求明细 (cpamp 12 列同款) */}
              {!isLoading && activeTab === 'realtime' && (
                <RealtimeTab snapshots={snapshots} modelPrices={modelPrices} />
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-400 bg-[#070A0F]">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>{t('footer.desc')}</span>
          <span className="font-mono text-slate-400">
            {settings.apiUrl
              ? t('footer.target', { url: settings.apiUrl })
              : t('footer.unconfiguredTarget')}
          </span>
        </div>
      </footer>
    </div>
  );
}
