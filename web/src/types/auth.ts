export interface RecentRequestBucket {
  time: string;
  success: number;
  failed: number;
}

export interface QuotaSignals {
  'X-Codex-Active-Limit'?: string;
  'X-Codex-Credits-Has-Credits'?: string;
  'X-Codex-Credits-Unlimited'?: string;
  'X-Codex-Plan-Type'?: string;
  'X-Codex-Primary-Over-Secondary-Limit-Percent'?: string;
  'X-Codex-Primary-Reset-After-Seconds'?: string;
  'X-Codex-Primary-Reset-At'?: string;
  'X-Codex-Primary-Used-Percent'?: string;
  'X-Codex-Primary-Window-Minutes'?: string;
  'X-Codex-Secondary-Reset-After-Seconds'?: string;
  'X-Codex-Secondary-Used-Percent'?: string;
  'X-Codex-Secondary-Window-Minutes'?: string;
  [key: string]: string | undefined;
}

export interface AuthQuota {
  observed_at?: string;
  signals?: QuotaSignals;
}

export interface AuthFileItem {
  id?: string;
  name: string;
  account?: string;
  email?: string;
  label?: string;
  provider: string;
  type?: string;
  account_type?: string;
  auth_index?: string;
  status: 'active' | 'disabled' | 'error' | string;
  disabled?: boolean;
  unavailable?: boolean;
  runtime_only?: boolean;
  status_message?: string;
  size?: number;
  path?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  modtime?: string;
  quota?: AuthQuota;
  recent_requests?: RecentRequestBucket[];
  recentRequests?: RecentRequestBucket[];
  success?: number;
  failed?: number;
  id_token?: {
    chatgpt_account_id?: string;
    plan_type?: string;
    [key: string]: any;
  };
  note?: string;
  priority?: number;
}

export type CredentialStatusType =
  | 'total'
  | 'available'
  | 'needsAttention'
  | 'quotaRisk'
  | 'disabled'
  | 'unconfirmed';

export interface CredentialCounts {
  total: number;
  available: number;
  needsAttention: number;
  quotaRisk: number;
  disabled: number;
  unconfirmed: number;
}

export interface EnrichedCredential extends AuthFileItem {
  computedStatus: CredentialStatusType;
  statusLabel: string;
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
  planDisplayName: string;
  totalRecentRequests: number;
  recentSuccessRate: number | null;
}
