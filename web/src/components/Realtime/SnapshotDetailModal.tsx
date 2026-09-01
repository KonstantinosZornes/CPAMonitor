import React, { useState } from 'react';
import { Modal } from '@/components/Common/Modal';
import { HeaderSnapshotItem } from '@/types/monitoring';
import { Badge } from '@/components/Common/Badge';
import {
  Clock,
  KeyRound,
  Layers,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { useTranslation } from '@/i18n';

interface SnapshotDetailModalProps {
  snapshot: HeaderSnapshotItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SnapshotDetailModal: React.FC<SnapshotDetailModalProps> = ({
  snapshot,
  isOpen,
  onClose,
}) => {
  const { t, locale } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!snapshot) return null;

  const meta = snapshot.response_metadata || {};
  const statusCode = meta.status_code || 200;
  const isSuccess = statusCode >= 200 && statusCode < 300;

  const handleCopyJson = () => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      }
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (ms?: number | null) => {
    if (!ms || isNaN(ms)) return '--';
    try {
      const d = new Date(ms);
      if (isNaN(d.getTime())) return '--';
      return d.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '--';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <Badge variant={isSuccess ? 'emerald' : 'rose'} size="md">
            HTTP {statusCode}
          </Badge>
          <span>{t('snapshotModal.title')}</span>
          <span className="text-xs text-slate-400 font-mono font-normal">
            ({snapshot.model})
          </span>
        </div>
      }
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Core Attributes Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              {t('snapshotModal.reqTime')}
            </span>
            <div className="font-mono text-slate-200">
              {formatTime(snapshot.timestamp_ms)}
            </div>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              {t('snapshotModal.ttft')}
            </span>
            <div className="font-mono text-slate-200 font-medium">
              {(() => {
                const ttft =
                  snapshot.ttft_ms ??
                  (snapshot as any).ttft_ms ??
                  meta.time_to_first_token_ms ??
                  (meta as any).ttft_ms;
                if (!ttft || ttft <= 0) return '--';
                return ttft < 1000 ? `${Math.round(ttft)} ms` : `${(ttft / 1000).toFixed(2)} s`;
              })()}
            </div>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {t('snapshotModal.latency')}
            </span>
            <div className="font-mono text-slate-200 font-semibold">
              {(() => {
                const latency =
                  snapshot.latency_ms ??
                  (snapshot as any).duration_ms ??
                  meta.latency_ms ??
                  (meta as any).duration_ms ??
                  (meta as any).response?.duration_ms ??
                  (meta as any).response?.latency_ms;
                if (!latency || latency <= 0) return '--';
                return latency < 1000 ? `${Math.round(latency)} ms` : `${(latency / 1000).toFixed(2)} s`;
              })()}
            </div>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              {t('snapshotModal.model')}
            </span>
            <div className="font-mono text-slate-200 truncate">
              {snapshot.model || snapshot.resolved_model || '--'}
            </div>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1 col-span-2">
            <span className="text-slate-400 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              {t('snapshotModal.account')}
            </span>
            <div className="font-mono text-slate-200 truncate">
              {snapshot.auth_label_snapshot ||
                snapshot.account_snapshot ||
                snapshot.auth_file_snapshot ||
                '--'}
            </div>
          </div>
        </div>

        {/* Trace ID & Quota Signals */}
        <div className="p-3.5 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">API Key:</span>
            <span className="font-mono text-slate-300 select-all truncate max-w-[70%]" title={snapshot.api_key_hash}>
              {snapshot.api_key_hash || '--'}
            </span>
          </div>

          {(snapshot.reasoning_effort || snapshot.service_tier || snapshot.request_service_tier || snapshot.response_service_tier) && (
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{t('realtime.colReasoningService')}:</span>
              <span className="font-mono text-slate-300">
                {[
                  snapshot.reasoning_effort,
                  snapshot.request_service_tier || snapshot.service_tier || snapshot.response_service_tier,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          )}

          {snapshot.fail_summary && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-400 shrink-0">{t('snapshotModal.failSummary')}:</span>
              <span className="font-mono text-rose-300 text-right break-all">
                {snapshot.fail_summary}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Trace ID:</span>
            <span className="font-mono text-slate-300 select-all">
              {snapshot.header_trace_id || '--'}
            </span>
          </div>

          {snapshot.header_quota_used_percent !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Header Quota Used %:</span>
              <span className="font-mono text-amber-400 font-semibold">
                {snapshot.header_quota_used_percent}%
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleCopyJson}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{copied ? t('realtime.copied') : t('snapshotModal.copyJson')}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            {t('snapshotModal.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
