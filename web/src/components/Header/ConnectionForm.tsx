import React, { useState } from 'react';
import { getStoredSettings, saveStoredSettings } from '@/services/storage';
import { testConnection } from '@/services/api';
import { CheckCircle2, AlertCircle, RefreshCw, KeyRound, Globe, ShieldCheck, Settings } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface ConnectionFormProps {
  onSaved: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
  onSaved,
  onCancel,
  showCancel = false,
  title,
  subtitle,
  showHeader = true,
}) => {
  const { t } = useTranslation();
  const [initialSettings] = useState(() => getStoredSettings());
  const [apiUrl, setApiUrl] = useState(initialSettings.apiUrl);
  const [apiKey, setApiKey] = useState(initialSettings.apiKey);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(initialSettings.autoRefreshInterval);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const displayTitle = title || t('connection.settingsTitle');
  const displaySubtitle = subtitle || t('connection.settingsSubtitle');

  const normalizeUrl = (url: string) => {
    let clean = url.trim();
    if (clean && !/^https?:\/\//i.test(clean)) {
      clean = `http://${clean}`;
    }
    return clean;
  };

  const handleTest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cleanUrl = normalizeUrl(apiUrl);
    if (!cleanUrl) {
      setTestResult({ success: false, message: t('connection.urlRequired') });
      return;
    }
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: t('connection.keyRequired') });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(cleanUrl, apiKey.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || t('connection.connectionFailed') });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cleanUrl = normalizeUrl(apiUrl);
    if (!cleanUrl) {
      setTestResult({ success: false, message: t('connection.urlRequired') });
      return;
    }
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: t('connection.keyRequired') });
      return;
    }
    saveStoredSettings({
      apiUrl: cleanUrl,
      apiKey: apiKey.trim(),
      autoRefreshInterval,
    });
    onSaved();
  };

  return (
    <div className="space-y-5 text-left select-text">
      {/* Unified Header */}
      {showHeader && (
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{displayTitle}</h2>
            <p className="text-xs text-slate-400">{displaySubtitle}</p>
          </div>
        </div>
      )}

      {/* Security & Local Storage Badge */}
      <div className="p-3.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-xs text-blue-300 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <div>
          <span className="font-semibold text-blue-200">{t('connection.securityNoticeTitle')}</span>
          {' '}{t('connection.securityNoticeDesc')}
        </div>
      </div>

      {/* API Endpoint */}
      <div>
        <label className="text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-slate-400" />
          <span>{t('connection.apiUrlLabel')}</span>
        </label>
        <input
          type="text"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder={t('connection.apiUrlPlaceholder')}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500 font-mono"
        />
        <p className="text-xs text-slate-400 mt-1">
          {t('connection.apiUrlHelp')}
        </p>
      </div>

      {/* API Key */}
      <div>
        <label className="text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-slate-400" />
          <span>{t('connection.apiKeyLabel')}</span>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t('connection.apiKeyPlaceholder')}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500 font-mono"
        />
        <p className="text-xs text-slate-400 mt-1">
          {t('connection.apiKeyHelp')}
        </p>
      </div>

      {/* Auto Refresh Interval */}
      <div>
        <label className="text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4 text-slate-400" />
          <span>{t('connection.refreshIntervalLabel')}</span>
        </label>
        <select
          value={autoRefreshInterval}
          onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value={5}>5 {t('header.secondsPerTime')}</option>
          <option value={10}>10 {t('header.secondsPerTime')} ({t('header.recommended')})</option>
          <option value={30}>30 {t('header.secondsPerTime')}</option>
          <option value={60}>60 {t('header.secondsPerTime')}</option>
          <option value={0}>{t('header.paused')}</option>
        </select>
      </div>

      {/* Test Result Message */}
      {testResult && (
        <div
          className={`p-3 rounded-lg flex items-start gap-2.5 text-xs ${
            testResult.success
              ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-500/30 text-rose-300'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          )}
          <div>{testResult.message}</div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !apiUrl.trim() || !apiKey.trim()}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
        >
          {testing ? (
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
          )}
          <span>{testing ? t('connection.testing') : t('connection.testConnection')}</span>
        </button>

        <div className="flex items-center gap-2.5">
          {showCancel && onCancel && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
              }}
              className="px-4 py-2 bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {t('connection.cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!apiUrl.trim() || !apiKey.trim()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            {t('connection.saveAndConnect')}
          </button>
        </div>
      </div>
    </div>
  );
};
