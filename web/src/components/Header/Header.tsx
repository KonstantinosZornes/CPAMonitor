import React, { useState } from 'react';
import {
  RefreshCw,
  Settings,
  Zap,
  Clock,
  Radio,
  AlertTriangle,
  Languages,
  Calendar,
} from 'lucide-react';
import { useTranslation } from '@/i18n';
import { TimeRangeType } from '@/services/storage';
import { isValidCustomDateRange } from '@/services/timeRange';

interface HeaderProps {
  isConfigured: boolean;
  isHealthy: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  refreshProgress: number;
  autoRefreshInterval: number;
  timeRange?: TimeRangeType;
  customStartDate?: string;
  customEndDate?: string;
  isSettingsOpen: boolean;
  onIntervalChange: (interval: number) => void;
  onTimeRangeChange?: (range: TimeRangeType, start?: string, end?: string) => void;
  onRefreshManual: () => void;
  onToggleSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConfigured,
  isHealthy,
  isRefreshing,
  lastUpdated,
  refreshProgress,
  autoRefreshInterval,
  timeRange = 'today',
  customStartDate = '',
  customEndDate = '',
  isSettingsOpen,
  onIntervalChange,
  onTimeRangeChange,
  onRefreshManual,
  onToggleSettings,
}) => {
  const { t, locale, setLocale } = useTranslation();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [tempStart, setTempStart] = useState(customStartDate);
  const [tempEnd, setTempEnd] = useState(customEndDate);
  const customRangeValid = isValidCustomDateRange(tempStart, tempEnd);

  const toggleLanguage = () => {
    setLocale(locale === 'zh' ? 'en' : 'zh');
  };

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--:--';
    const Y = date.getFullYear();
    const M = (date.getMonth() + 1).toString().padStart(2, '0');
    const D = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  };

  return (
    <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5 shadow-xl">
      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand & Connection Status */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-0.5 shadow-lg shadow-blue-500/20 flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-400 fill-blue-400/20" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>CPAMonitor</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-blue-950/80 text-blue-400 border border-blue-500/30 font-normal">
                  v1.0
                </span>
              </h1>

              {/* Status Badge */}
              {!isConfigured ? (
                <button
                  type="button"
                  onClick={onToggleSettings}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-amber-950/60 border-amber-500/30 text-amber-400 hover:bg-amber-900/50 transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{t('header.unconfigured')}</span>
                </button>
              ) : (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    isHealthy
                      ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                    }`}
                  />
                  <span>{isHealthy ? t('header.online') : t('header.offline')}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {t('header.subtitle')}
            </p>
          </div>
        </div>

        {/* Global Controls & Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Last Updated Timestamp */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('header.updatedAt')}</span>
            <span className="text-slate-200 font-mono">{formatTime(lastUpdated)}</span>
          </div>

          {/* Auto Refresh Selector & Progress */}
          <div className="relative flex items-center bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
            {/* Countdown bar */}
            {autoRefreshInterval > 0 && isConfigured && (
              <div
                className="absolute bottom-0 left-0 h-[2px] bg-blue-500"
                style={{ width: `${refreshProgress}%` }}
              />
            )}

            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300">
              <Radio
                className={`w-3.5 h-3.5 ${
                  autoRefreshInterval > 0 && isConfigured
                    ? 'text-emerald-400 animate-pulse'
                    : 'text-slate-500'
                }`}
              />
              <select
                value={autoRefreshInterval}
                onChange={(e) => onIntervalChange(Number(e.target.value))}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
              >
                <option value={5} className="bg-slate-900 text-slate-200">
                  {t('header.autoRefresh')}: 5s
                </option>
                <option value={10} className="bg-slate-900 text-slate-200">
                  {t('header.autoRefresh')}: 10s
                </option>
                <option value={30} className="bg-slate-900 text-slate-200">
                  {t('header.autoRefresh')}: 30s
                </option>
                <option value={60} className="bg-slate-900 text-slate-200">
                  {t('header.autoRefresh')}: 60s
                </option>
                <option value={0} className="bg-slate-900 text-slate-200">
                  {t('header.autoRefresh')}: {t('header.paused')}
                </option>
              </select>
            </div>
          </div>

          {/* Time Range Selector */}
          <div className="relative flex items-center bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-blue-400 mr-1.5" />
            <select
              value={timeRange}
              onChange={(e) => {
                const next = e.target.value as TimeRangeType;
                if (next === 'custom') {
                  setShowCustomPicker(true);
                } else {
                  setShowCustomPicker(false);
                  onTimeRangeChange?.(next);
                }
              }}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
            >
              <option value="today" className="bg-slate-900 text-slate-200">{t('timeRange.today')}</option>
              <option value="yesterday" className="bg-slate-900 text-slate-200">{t('timeRange.yesterday')}</option>
              <option value="7d" className="bg-slate-900 text-slate-200">{t('timeRange.last7Days')}</option>
              <option value="14d" className="bg-slate-900 text-slate-200">{t('timeRange.last14Days')}</option>
              <option value="30d" className="bg-slate-900 text-slate-200">{t('timeRange.last30Days')}</option>
              <option value="all" className="bg-slate-900 text-slate-200">{t('timeRange.all')}</option>
              <option value="custom" className="bg-slate-900 text-slate-200">{t('timeRange.custom')}</option>
            </select>

            {/* Custom Date Range Popover */}
            {showCustomPicker && (
              <div className="absolute top-full right-0 mt-2 z-50 p-3 bg-[#0D121F] border border-slate-700 rounded-xl shadow-2xl space-y-2.5 w-64">
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>{t('timeRange.custom')}</span>
                  <button
                    type="button"
                    onClick={() => setShowCustomPicker(false)}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] text-slate-400">{t('timeRange.startDate')}</label>
                  <input
                    type="date"
                    value={tempStart}
                    onChange={(e) => setTempStart(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] text-slate-400">{t('timeRange.endDate')}</label>
                  <input
                    type="date"
                    value={tempEnd}
                    onChange={(e) => setTempEnd(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={!customRangeValid}
                  onClick={() => {
                    setShowCustomPicker(false);
                    onTimeRangeChange?.('custom', tempStart, tempEnd);
                  }}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  {t('timeRange.apply')}
                </button>
                {!customRangeValid && (
                  <p className="text-[11px] text-rose-400">{t('timeRange.invalidRange')}</p>
                )}
              </div>
            )}
          </div>

          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 rounded-lg transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            title="Switch Language / 切换语言"
          >
            <Languages className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold">{locale === 'zh' ? 'EN' : '中文'}</span>
          </button>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={onRefreshManual}
            disabled={isRefreshing || !isConfigured}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-50 text-slate-200 hover:text-white border border-slate-700/60 rounded-lg transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            title={t('header.refreshNow')}
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`}
            />
            <span className="hidden sm:inline">{t('header.refreshNow')}</span>
          </button>

          {/* Settings Toggle Button */}
          <button
            type="button"
            onClick={onToggleSettings}
            className={`p-2 border rounded-lg transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
              isSettingsOpen
                ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700/60'
            }`}
            title={t('header.settings')}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isSettingsOpen ? t('header.backToMonitor') : t('header.settings')}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
