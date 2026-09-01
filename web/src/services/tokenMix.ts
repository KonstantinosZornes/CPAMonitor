// Token Mix 环形图分段计算（对齐 cpamp dashboard buildTokenMix 口径）：
// - input_tokens 是归一化总输入，cache 桶已包含在内，需扣除后才是"纯输入"；
// - reasoning_tokens 是 output_tokens 的子集，按总 token 溢出优先从 output 扣减。
import type { TodayMetrics } from '@/types/dashboard';

export type TokenMixSegmentKey = 'input' | 'cached' | 'output' | 'reasoning';

export interface TokenMixSegment {
  key: TokenMixSegmentKey;
  tokens: number;
}

export const buildTokenMixSegments = (
  today?: TodayMetrics | null
): TokenMixSegment[] => {
  if (!today) return [];

  const totalInputTokens = Math.max(today.input_tokens || 0, 0);
  const cachedTokens =
    Math.max(today.cached_tokens || 0, 0) +
    Math.max(today.cache_read_tokens || 0, 0) +
    Math.max(today.cache_creation_tokens || 0, 0);
  let inputTokens = Math.max(totalInputTokens - cachedTokens, 0);
  let outputTokens = Math.max(today.output_tokens || 0, 0);
  const reasoningTokens = Math.max(today.reasoning_tokens || 0, 0);

  const totalTokens = Math.max(today.total_tokens || 0, 0);
  if (totalTokens > 0) {
    let overflow = inputTokens + cachedTokens + outputTokens + reasoningTokens - totalTokens;
    if (overflow > 0) {
      const reasoningDeduction = Math.min(Math.min(outputTokens, reasoningTokens), overflow);
      outputTokens -= reasoningDeduction;
      overflow -= reasoningDeduction;
    }
    if (overflow > 0) {
      const outputDeduction = Math.min(outputTokens, overflow);
      outputTokens -= outputDeduction;
      overflow -= outputDeduction;
    }
    if (overflow > 0) {
      inputTokens -= Math.min(inputTokens, overflow);
    }
  }

  return [
    { key: 'input', tokens: inputTokens },
    { key: 'cached', tokens: cachedTokens },
    { key: 'output', tokens: outputTokens },
    { key: 'reasoning', tokens: reasoningTokens },
  ];
};
