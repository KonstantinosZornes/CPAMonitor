import type { TimeRangeType } from './storage';

const parseLocalDate = (value?: string): Date | null => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export const isValidCustomDateRange = (start?: string, end?: string): boolean => {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  return Boolean(
    startDate &&
    endDate &&
    startDate.getTime() <= endDate.getTime() &&
    startDate.getTime() <= todayEnd.getTime()
  );
};

export const computeTimeRangeTimestamps = (
  range: TimeRangeType = 'today',
  customStart?: string,
  customEnd?: string,
  now: Date = new Date()
): { fromMs: number; toMs: number; todayStartMs: number } => {
  const startOfTodayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfToday = startOfTodayDate.getTime();
  const nowMs = now.getTime();
  let fromMs = startOfToday;
  let toMs = nowMs;

  const daysAgo = (days: number) => {
    const date = new Date(startOfTodayDate);
    date.setDate(date.getDate() - days);
    return date.getTime();
  };

  switch (range) {
    case 'yesterday':
      fromMs = daysAgo(1);
      toMs = startOfToday - 1;
      break;
    case '7d':
      fromMs = daysAgo(6);
      break;
    case '14d':
      fromMs = daysAgo(13);
      break;
    case '30d':
      fromMs = daysAgo(29);
      break;
    case 'all':
      // Analytics requires a positive timestamp; 1 represents the full persisted history.
      fromMs = 1;
      break;
    case 'custom': {
      const startDate = parseLocalDate(customStart);
      const endDate = parseLocalDate(customEnd);
      if (
        startDate &&
        endDate &&
        startDate.getTime() <= endDate.getTime() &&
        startDate.getTime() <= nowMs
      ) {
        endDate.setHours(23, 59, 59, 999);
        fromMs = startDate.getTime();
        toMs = Math.min(endDate.getTime(), nowMs);
      }
      break;
    }
    case 'today':
    default:
      break;
  }

  return { fromMs, toMs, todayStartMs: startOfToday };
};

const HOUR_MS = 3_600_000;
const MAX_TIMELINE_SLOTS = 400;

/**
 * 后端 timeline 只返回有数据的桶，稀疏序列（如"昨天"仅一个非零小时桶）在波形图上
 * 无法成线。这里按真实桶推断步长，把 [fromMs, toMs] 补零成连续时间轴；
 * 不落在网格上的真实桶原样保留，保证不丢数据。
 */
export const buildDenseTimeline = <T extends { bucket_ms: number }>(
  points?: T[],
  fromMs = 0,
  toMs = Date.now()
): T[] => {
  const real = (points || [])
    .filter((p) => p && typeof p.bucket_ms === 'number')
    .slice()
    .sort((a, b) => a.bucket_ms - b.bucket_ms);
  if (real.length === 0) return [];

  const span = Math.max(HOUR_MS, toMs - fromMs);

  // 步长优先取真实桶间距的中位数；单桶时按范围跨度选择小时级或跨度均分。
  let stepMs = 0;
  if (real.length >= 2) {
    const diffs: number[] = [];
    for (let i = 1; i < real.length; i++) {
      const d = real[i].bucket_ms - real[i - 1].bucket_ms;
      if (d > 0) diffs.push(d);
    }
    if (diffs.length) {
      diffs.sort((a, b) => a - b);
      stepMs = diffs[Math.floor(diffs.length / 2)];
    }
  }
  if (!stepMs || stepMs <= 0) {
    stepMs = span <= 36 * HOUR_MS
      ? HOUR_MS
      : Math.max(HOUR_MS, Math.ceil(span / 48 / HOUR_MS) * HOUR_MS);
  }
  if (span / stepMs > MAX_TIMELINE_SLOTS) {
    stepMs = Math.max(HOUR_MS, Math.ceil(span / MAX_TIMELINE_SLOTS / HOUR_MS) * HOUR_MS);
  }

  // 网格锚定在首个真实桶；若首个桶与范围起点恰好相差整数个步长，则回填对齐到起点。
  // fromMs=0（'all'）时以首个真实桶为锚，避免生成 1970 年的空槽。
  const first = real[0].bucket_ms;
  const offset = first - fromMs;
  const start = fromMs > 0 && offset > 0 && offset % stepMs === 0 ? fromMs : first;

  const byMs = new Map(real.map((p) => [p.bucket_ms, p] as const));
  const dense: T[] = [];
  for (let t = start; t <= toMs && byMs.size + dense.length < MAX_TIMELINE_SLOTS * 2; t += stepMs) {
    const realPoint = byMs.get(t);
    byMs.delete(t);
    dense.push(realPoint ?? ({ bucket_ms: t, calls: 0, success: 0, failure: 0, tokens: 0 } as unknown as T));
  }
  for (const p of byMs.values()) dense.push(p);
  dense.sort((a, b) => a.bucket_ms - b.bucket_ms);
  return dense;
};
