export type TimeRangeType = 'today' | 'yesterday' | '7d' | '14d' | '30d' | 'all' | 'custom';

export interface AppSettings {
  apiUrl: string;
  apiKey: string;
  autoRefreshInterval: number; // in seconds, 0 = paused
  timeRange: TimeRangeType;
  customStartDate?: string;
  customEndDate?: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: '',
  apiKey: '',
  autoRefreshInterval: 10,
  timeRange: 'today',
};

const PRIMARY_KEY = 'cpamonitor.settings.v2';
const FALLBACK_KEYS = ['cpamonitor.settings.v1', 'cpa_monitor_settings', 'cpamonitor_config'];

export const isConfigured = (settings?: AppSettings): boolean => {
  const current = settings || getStoredSettings();
  return Boolean(
    current &&
    typeof current.apiUrl === 'string' &&
    current.apiUrl.trim().length > 0 &&
    typeof current.apiKey === 'string' &&
    current.apiKey.trim().length > 0
  );
};

export const getStoredSettings = (): AppSettings => {
  try {
    let raw = localStorage.getItem(PRIMARY_KEY);
    if (!raw) {
      for (const k of FALLBACK_KEYS) {
        const fallback = localStorage.getItem(k);
        if (fallback) {
          raw = fallback;
          break;
        }
      }
    }
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      autoRefreshInterval: typeof parsed?.autoRefreshInterval === 'number'
        ? parsed.autoRefreshInterval
        : (Number(parsed?.autoRefreshInterval) || DEFAULT_SETTINGS.autoRefreshInterval),
    };
  } catch (err) {
    console.error('Failed to read settings from localStorage', err);
    return DEFAULT_SETTINGS;
  }
};

export const saveStoredSettings = (settings: Partial<AppSettings>): AppSettings => {
  try {
    const current = getStoredSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(PRIMARY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save settings to localStorage', err);
    return getStoredSettings();
  }
};
