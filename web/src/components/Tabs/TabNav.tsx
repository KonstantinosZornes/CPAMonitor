import React from 'react';
import {
  LayoutDashboard,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslation } from '@/i18n';

export type ActiveTabType = 'dashboard' | 'accounts' | 'realtime';

interface TabNavProps {
  activeTab: ActiveTabType;
  onSelectTab: (tab: ActiveTabType) => void;
  accountCount?: number;
  realtimeCount?: number;
}

export const TabNav: React.FC<TabNavProps> = ({
  activeTab,
  onSelectTab,
  accountCount,
  realtimeCount,
}) => {
  const { t } = useTranslation();

  const tabs = [
    {
      id: 'dashboard' as const,
      label: t('tabs.dashboard'),
      icon: LayoutDashboard,
    },
    {
      id: 'accounts' as const,
      label: t('tabs.accounts'),
      icon: Users,
      badge: accountCount,
    },
    {
      id: 'realtime' as const,
      label: t('tabs.realtime'),
      icon: Zap,
      badge: realtimeCount,
    },
  ];

  return (
    <div className="border-b border-slate-800/80">
      <nav className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs md:text-sm font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono font-normal ${
                    isActive
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
