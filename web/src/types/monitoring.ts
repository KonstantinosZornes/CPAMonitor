import { CredentialStatusType } from './auth';

export interface ResponseMetadata {
  status_code?: number;
  latency_ms?: number;
  duration_ms?: number;
  ttft_ms?: number;
  time_to_first_token_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  cost?: number;
  total_cost?: number;
  error_message?: string;
  error_type?: string;
  headers?: Record<string, string>;
  quota?: {
    used_percent?: number;
  };
  trace?: {
    primary_trace_id?: string;
  };
  tokens?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
    total_tokens?: number;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  response?: {
    duration_ms?: number;
    latency_ms?: number;
    status_code?: number;
    ttft_ms?: number;
  };
  [key: string]: any;
}

export interface HeaderSnapshotItem {
  event_hash: string;
  timestamp_ms: number;
  model: string;
  analytics_model?: string;
  requested_model?: string;
  resolved_model?: string;
  endpoint?: string;
  auth_file_snapshot?: string;
  auth_index?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_account_id_snapshot?: string;
  api_key_hash?: string;
  source?: string;
  source_hash?: string;
  reasoning_effort?: string;
  service_tier?: string;
  request_service_tier?: string;
  response_service_tier?: string;
  executor_type?: string;
  fail_summary?: string;
  response_metadata?: ResponseMetadata;
  header_quota_recover_at_ms?: number;
  header_quota_used_percent?: number;
  header_quota_plan_type?: string;
  header_trace_id?: string;
  latency_ms?: number;
  duration_ms?: number;
  ttft_ms?: number;
  reasoning_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  tokens?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
    total_tokens?: number;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  cost?: number;
  total_cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  total_tokens?: number;
}

export interface HeaderSnapshotsResponse {
  generated_at_ms: number;
  from_ms: number;
  to_ms: number;
  items: HeaderSnapshotItem[];
}

export interface AccountMonitoringRow {
  id: string;
  account: string;
  name: string;
  email?: string;
  label?: string;
  provider: string;
  planType: string;
  status: CredentialStatusType;
  statusLabel: string;
  disabled: boolean;
  totalCalls: number;
  successCalls: number;
  failureCalls: number;
  successRate: number; // 0 - 100
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  totalCost: number;
  averageLatencyMs: number;
  quotaUsedPercent: number | null;
  models: string[];
  lastSeenAtMs: number | null;
  authIndex?: string;
}

export type AccountSortKey =
  | 'lastSeenAt'
  | 'totalCalls'
  | 'successCalls'
  | 'failureCalls'
  | 'successRate'
  | 'totalTokens'
  | 'inputTokens'
  | 'outputTokens'
  | 'cachedTokens'
  | 'totalCost';

export type AccountSortDirection = 'asc' | 'desc';

export interface AccountSortState {
  key: AccountSortKey;
  direction: AccountSortDirection;
}

export const DEFAULT_ACCOUNT_SORT: AccountSortState = {
  key: 'lastSeenAt',
  direction: 'desc',
};

export interface MonitoringAnalyticsAccountStat {
  id?: string;
  account_snapshot?: string;
  auth_label_snapshot?: string;
  auth_file_snapshot?: string;
  auth_provider_snapshot?: string;
  auth_indices?: string[];
  source_hashes?: string[];
  sources?: string[];
  calls?: number;
  success_calls?: number;
  failure_calls?: number;
  success_rate?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  total_tokens?: number;
  cost?: number;
  average_latency_ms?: number | null;
  last_seen_ms?: number;
  models?: Array<{
    model: string;
    calls?: number;
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
    total_tokens?: number;
    cost?: number;
  }>;
}

export interface MonitoringAnalyticsResponse {
  generated_at_ms?: number;
  account_stats?: MonitoringAnalyticsAccountStat[];
  events?: {
    items?: any[];
    [key: string]: any;
  };
  summary?: any;
  timeline?: any[];
  [key: string]: any;
}
