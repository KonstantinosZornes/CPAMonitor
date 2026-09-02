import axios, { AxiosInstance } from 'axios';
import { getStoredSettings, isConfigured } from './storage';
import { AuthFileItem } from '@/types/auth';
import { DashboardSummaryResponse, CollectorStatus } from '@/types/dashboard';
import { HeaderSnapshotsResponse, MonitoringAnalyticsResponse } from '@/types/monitoring';

declare global {
  interface Window {
    /** 容器化部署时由 server.mjs 注入，让生产构建也走 /api-proxy 动态代理 */
    __CPA_MONITOR_PROXY__?: boolean;
  }
}

/** dev 与本地 preview 模式始终走本地代理；容器化部署时依赖服务端注入的开关 */
export const shouldUseLocalProxy = (): boolean => {
  if (typeof window === 'undefined') return import.meta.env.DEV;
  const isDefaultVitePreview =
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) &&
    window.location.port === '4173';
  return import.meta.env.DEV || isDefaultVitePreview || window.__CPA_MONITOR_PROXY__ === true;
};

export const createApiClient = (): AxiosInstance => {
  const settings = getStoredSettings();
  const rawUrl = settings.apiUrl.trim().replace(/\/+$/, '');
  const proxyUrl = (settings.proxyUrl || '').trim();
  const useLocalProxy = shouldUseLocalProxy();
  const baseURL = useLocalProxy ? '/api-proxy' : rawUrl;

  const client = axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      ...(useLocalProxy && rawUrl ? { 'x-target-url': rawUrl } : {}),
      ...(useLocalProxy && proxyUrl ? { 'x-proxy-url': proxyUrl } : {}),
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
    },
  });

  return client;
};

export const fetchHealth = async (): Promise<{ ok: boolean; service?: string }> => {
  if (!isConfigured()) throw new Error('CPAMP service address and API key are not configured');
  const client = createApiClient();
  const resp = await client.get('/health');
  return resp.data;
};

export const fetchStatus = async (): Promise<CollectorStatus> => {
  if (!isConfigured()) throw new Error('CPAMP service address and API key are not configured');
  const client = createApiClient();
  const resp = await client.get('/status');
  return resp.data;
};

export const fetchAuthFiles = async (): Promise<AuthFileItem[]> => {
  if (!isConfigured()) return [];
  const client = createApiClient();
  const resp = await client.get('/v0/management/auth-files');
  return resp.data?.files || [];
};

export const fetchDashboardSummary = async (todayStartMs?: number, nowMs?: number): Promise<DashboardSummaryResponse | null> => {
  if (!isConfigured()) return null;
  const client = createApiClient();
  
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startMs = todayStartMs && todayStartMs > 0 ? todayStartMs : startOfDay;
  const endMs = nowMs && nowMs >= startMs ? nowMs : Date.now();

  const resp = await client.get('/v0/management/dashboard/summary', {
    params: {
      today_start_ms: startMs,
      now_ms: endMs,
      top_models: 10,
      recent_failures: 10,
    },
  });
  return resp.data;
};

export const fetchHeaderSnapshots = async (): Promise<HeaderSnapshotsResponse> => {
  if (!isConfigured()) return { generated_at_ms: Date.now(), from_ms: 0, to_ms: Date.now(), items: [] };
  const client = createApiClient();
  const resp = await client.get('/v0/management/monitoring/header-snapshots');
  return resp.data;
};

let analyticsEndpointCache: { apiUrl: string; endpoint: string } | null = null;

export const fetchMonitoringAnalytics = async (
  fromMs?: number,
  toMs?: number
): Promise<MonitoringAnalyticsResponse | null> => {
  if (!isConfigured()) return null;
  const client = createApiClient();
  try {
    const apiUrl = getStoredSettings().apiUrl.trim().replace(/\/+$/, '');
    const now = Date.now();
    const nowD = new Date(now);
    nowD.setHours(0, 0, 0, 0);
    const startOfToday = nowD.getTime();

    // 默认以今日 00:00:00 为起始，确保大于 0，避免 0 导致后端 400 Bad Request
    const startMs = fromMs && fromMs > 0 ? fromMs : startOfToday;
    const endMs = toMs && toMs >= startMs ? toMs : now;

    const payload = {
      from_ms: startMs,
      to_ms: endMs,
      now_ms: now,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      include: {
        summary: true,
        account_stats: true,
        credential_stats: true,
        model_stats: true,
        hourly_distribution: true,
        timeline: true,
        events_page: {
          limit: 100, // 优化事件明细为最近 100 条，减少后端序列化与网络体积
        },
      },
    };

    const cachedEndpoint = analyticsEndpointCache?.apiUrl === apiUrl
      ? analyticsEndpointCache.endpoint
      : null;
    const candidates = Array.from(new Set([
      cachedEndpoint,
      '/v0/management/monitoring/analytics',
      '/api/monitoring/analytics',
    ].filter((endpoint): endpoint is string => Boolean(endpoint))));

    for (const endpoint of candidates) {
      try {
        const resp = await client.post(endpoint, payload, { timeout: 30000 });
        if (resp.data) {
          analyticsEndpointCache = { apiUrl, endpoint };
          return resp.data;
        }
      } catch {
        if (analyticsEndpointCache?.apiUrl === apiUrl && analyticsEndpointCache.endpoint === endpoint) {
          analyticsEndpointCache = null;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const fetchModelPrices = async (): Promise<Record<string, any>> => {
  if (!isConfigured()) return {};
  const client = createApiClient();
  try {
    const resp = await client.get('/v0/management/model-prices');
    return resp.data?.prices || {};
  } catch {
    return {};
  }
};

export const testConnection = async (
  apiUrl: string,
  apiKey: string,
  proxyUrl = ''
): Promise<{ success: boolean; message: string }> => {
  if (!apiUrl.trim()) {
    return {
      success: false,
      message: 'API URL is required',
    };
  }
  if (!apiKey.trim()) {
    return {
      success: false,
      message: 'Management key is required',
    };
  }

  try {
    const rawUrl = apiUrl.trim().replace(/\/+$/, '');
    const cleanProxy = proxyUrl.trim();
    const useLocalProxy = shouldUseLocalProxy();
    const baseURL = useLocalProxy ? '/api-proxy' : rawUrl;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(useLocalProxy ? { 'x-target-url': rawUrl } : {}),
      ...(useLocalProxy && cleanProxy ? { 'x-proxy-url': cleanProxy } : {}),
      Authorization: `Bearer ${apiKey.trim()}`,
    };

    const client = axios.create({
      baseURL,
      timeout: 8000,
      headers,
    });

    const [healthResp, managementResp] = await Promise.all([
      client.get('/health'),
      client.get('/v0/management/auth-files'),
    ]);
    if (healthResp.status === 200 && Array.isArray(managementResp.data?.files)) {
      return {
        success: true,
        message: `Connected! Service: ${healthResp.data?.service || 'CPA-Manager-Plus'} (HTTP 200)`,
      };
    }
    return {
      success: false,
      message: `Unexpected status: ${healthResp.status}`,
    };
  } catch (err: any) {
    const errMsg =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      String(err);
    return {
      success: false,
      message: `Connection failed: ${errMsg}`,
    };
  }
};
