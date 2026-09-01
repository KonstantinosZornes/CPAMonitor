import React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Ban,
  HelpCircle,
} from 'lucide-react';
import { CredentialCounts, CredentialStatusType } from '@/types/auth';
import { useTranslation } from '@/i18n';

interface CredentialStatusCardsProps {
  counts: CredentialCounts;
  activeStatus: CredentialStatusType | 'all';
  onSelectStatus: (status: CredentialStatusType | 'all') => void;
}

export const CredentialStatusCards: React.FC<CredentialStatusCardsProps> = ({
  counts,
  activeStatus,
  onSelectStatus,
}) => {
  const { t } = useTranslation();

  const cards = [
    {
      key: 'total' as const,
      label: t('statusCards.total'),
      count: counts.total,
      description: t('statusCards.descTotal'),
      icon: ShieldCheck,
      color: 'blue',
      badgeClass: 'text-blue-400 border-blue-500/30 bg-blue-950/40',
      activeBorder: 'border-blue-500 ring-1 ring-blue-500 shadow-lg shadow-blue-500/10',
      iconColor: 'text-blue-400',
    },
    {
      key: 'available' as const,
      label: t('statusCards.available'),
      count: counts.available,
      description: t('statusCards.descAvailable'),
      icon: CheckCircle2,
      color: 'emerald',
      badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40',
      activeBorder: 'border-emerald-500 ring-1 ring-emerald-500 shadow-lg shadow-emerald-500/10',
      iconColor: 'text-emerald-400',
    },
    {
      key: 'needsAttention' as const,
      label: t('statusCards.needsAttention'),
      count: counts.needsAttention,
      description: t('statusCards.descNeedsAttention'),
      icon: AlertTriangle,
      color: 'rose',
      badgeClass: 'text-rose-400 border-rose-500/30 bg-rose-950/40',
      activeBorder: 'border-rose-500 ring-1 ring-rose-500 shadow-lg shadow-rose-500/10',
      iconColor: 'text-rose-400',
    },
    {
      key: 'quotaRisk' as const,
      label: t('statusCards.quotaRisk'),
      count: counts.quotaRisk,
      description: t('statusCards.descQuotaRisk'),
      icon: Flame,
      color: 'amber',
      badgeClass: 'text-amber-400 border-amber-500/30 bg-amber-950/40',
      activeBorder: 'border-amber-500 ring-1 ring-amber-500 shadow-lg shadow-amber-500/10',
      iconColor: 'text-amber-400',
    },
    {
      key: 'disabled' as const,
      label: t('statusCards.disabled'),
      count: counts.disabled,
      description: t('statusCards.descDisabled'),
      icon: Ban,
      color: 'slate',
      badgeClass: 'text-slate-400 border-slate-700 bg-slate-800/60',
      activeBorder: 'border-slate-400 ring-1 ring-slate-400 shadow-lg shadow-slate-500/10',
      iconColor: 'text-slate-400',
    },
    {
      key: 'unconfirmed' as const,
      label: t('statusCards.unconfirmed'),
      count: counts.unconfirmed,
      description: t('statusCards.descUnconfirmed'),
      icon: HelpCircle,
      color: 'purple',
      badgeClass: 'text-purple-400 border-purple-500/30 bg-purple-950/40',
      activeBorder: 'border-purple-500 ring-1 ring-purple-500 shadow-lg shadow-purple-500/10',
      iconColor: 'text-purple-400',
    },
  ];

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>{t('statusCards.total')}</span>
        </h2>
        {activeStatus !== 'all' && (
          <button
            onClick={() => onSelectStatus('all')}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
          >
            {t('accounts.allStatuses')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const isSelected = activeStatus === card.key;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onSelectStatus(card.key)}
              className={`text-left p-3.5 rounded-xl border bg-[#111827]/80 hover:bg-[#151e32] transition-all cursor-pointer relative group ${
                isSelected
                  ? card.activeBorder
                  : 'border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Header: Label & Icon */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
                  {card.label}
                </span>
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center ${card.badgeClass}`}
                >
                  <Icon className={`w-3.5 h-3.5 ${card.iconColor}`} />
                </div>
              </div>

              {/* Number Value */}
              <div className="text-2xl font-bold font-mono text-white tracking-tight mb-1">
                {card.count.toLocaleString()}
              </div>

              {/* Description */}
              <div className="text-[11px] text-slate-400 leading-tight">
                {card.description}
              </div>

              {/* Active Indicator Pin */}
              {isSelected && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-blue-500/20 text-blue-300 text-[9px] px-1.5 py-0.5 rounded-full border border-blue-500/40">
                  <span>{t('statusCards.activeTag')}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
