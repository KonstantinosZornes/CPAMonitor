export interface TodayMetrics {
  total_calls: number;
  success_calls: number;
  failure_calls: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  total_cost: number;
  average_latency_ms: number | null;
  zero_token_calls: number;
}

export interface TrafficTimelinePoint {
  bucket_ms: number;
  label?: string;
  calls: number;
  tokens: number;
  success: number;
  failure: number;
  calls_share: number;
  tokens_share: number;
  failure_rate: number;
}

export interface TopModelItem {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  success_rate: number;
}

export interface ModelCostRankItem {
  model: string;
  cost: number;
  tokens: number;
  calls: number;
}

export interface TokenMix {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  [key: string]: number | undefined;
}

export interface RecentFailureItem {
  timestamp_ms?: number;
  model?: string;
  error?: string;
  error_message?: string;
  auth_label?: string;
  status_code?: number;
  latency_ms?: number;
  [key: string]: any;
}

export interface DashboardSummaryResponse {
  generated_at_ms: number;
  window?: string;
  today: TodayMetrics;
  rolling_30m?: any;
  top_models_today: TopModelItem[];
  model_cost_rank: ModelCostRankItem[];
  traffic_timeline: TrafficTimelinePoint[];
  hourly_activity?: any[];
  today_request_health_timeline?: any[];
  token_mix?: TokenMix;
  channel_health?: any;
  failure_sources?: any;
  recent_failures?: RecentFailureItem[];
}

export interface CollectorStatus {
  collector?: {
    collector: string;
    upstream: string;
    mode: string;
    transport: string;
    totalInserted: number;
    totalSkipped: number;
    deadLetters: number;
    lastConsumedAt: number;
    lastInsertedAt: number;
  };
  database?: {
    databaseBytes: number;
    walBytes: number;
    totalBytes: number;
  };
  events?: number;
  service?: string;
  ok?: boolean;
}
