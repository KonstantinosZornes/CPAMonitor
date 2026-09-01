// 模型单价与单次调用成本计算（对齐 cpamp：单价均为"每百万 token"）。
// 完整对齐上游 utils/usage calculateCost 选择链：
//   基础价 → contextTiers(上下文阶梯) → serviceTiers(显式档位价) →
//   长上下文加价(×2/×1.5) → 兜底档位倍率(priority/fast/flex/batch)。
export interface ModelPriceContextTier {
  thresholdTokens: number;
  prompt?: number;
  completion?: number;
  cache?: number;
  cacheRead?: number;
  cacheCreation?: number;
  promptConfigured?: boolean;
  completionConfigured?: boolean;
  cacheConfigured?: boolean;
  cacheReadConfigured?: boolean;
  cacheCreationConfigured?: boolean;
}

export interface ModelPriceServiceTier {
  mode?: string;
  serviceTier?: string;
  prompt?: number;
  completion?: number;
  cache?: number;
  cacheRead?: number;
  cacheCreation?: number;
  promptConfigured?: boolean;
  completionConfigured?: boolean;
  cacheConfigured?: boolean;
  cacheReadConfigured?: boolean;
  cacheCreationConfigured?: boolean;
}

export interface ModelPrice {
  prompt?: number;
  completion?: number;
  cache?: number;
  cacheRead?: number;
  cacheCreation?: number;
  promptConfigured?: boolean;
  completionConfigured?: boolean;
  cacheReadConfigured?: boolean;
  cacheCreationConfigured?: boolean;
  contextTiers?: ModelPriceContextTier[];
  serviceTiers?: ModelPriceServiceTier[];
  [key: string]: unknown;
}

export const TOKENS_PER_PRICE_UNIT = 1_000_000;

export interface EventTokens {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/** 参与档位判定的调用上下文（决定 priority/flex 等档位的选择顺序）。 */
export interface EventCostContext {
  requestServiceTier?: string;
  serviceTier?: string;
  responseServiceTier?: string;
  provider?: string;
  executorType?: string;
  authProvider?: string;
}

const toFiniteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

// 与 cpamp isConfiguredPriceValue 一致：显式 configured 标记或正数即视为已配置。
const isConfiguredPriceValue = (value: unknown, configured?: boolean): boolean => {
  const parsed = Number(value);
  return configured === true || (Number.isFinite(parsed) && parsed > 0);
};

const normalizedModelSlug = (modelName?: string): string => {
  const normalized = String(modelName ?? '').trim().toLowerCase();
  const separator = normalized.lastIndexOf('/');
  return separator >= 0 ? normalized.slice(separator + 1) : normalized;
};

const isModelFamily = (modelName: string | undefined, family: string): boolean => {
  const slug = normalizedModelSlug(modelName);
  return slug === family || slug.startsWith(`${family}-`);
};

const isGpt56Model = (modelName: string | undefined): boolean =>
  isModelFamily(modelName, 'gpt-5.6');

// 与 cpamp supportsLongContextPremium 一致：这些家族支持 272k 以上长上下文加价。
const supportsLongContextPremium = (modelName: string | undefined): boolean => {
  const slug = normalizedModelSlug(modelName);
  if (isGpt56Model(slug)) return true;
  if (slug === 'gpt-5.5' || slug.startsWith('gpt-5.5-20')) return true;
  return (
    slug === 'gpt-5.4' ||
    slug.startsWith('gpt-5.4-20') ||
    slug === 'gpt-5.4-pro' ||
    slug.startsWith('gpt-5.4-pro-20')
  );
};

// 与 cpamp getServiceTierMultiplier 一致：OpenAI Priority 各家族倍率兼容层。
const getServiceTierMultiplier = (modelName: string | undefined, serviceTier?: string): number => {
  const tier = String(serviceTier ?? '').trim().toLowerCase();
  if (tier === 'flex' || tier === 'batch') return 0.5;
  if (tier !== 'priority' && tier !== 'fast') return 1;
  if (isModelFamily(modelName, 'gpt-5.6')) return 2;
  if (isModelFamily(modelName, 'gpt-5.5')) return 2.5;
  if (isModelFamily(modelName, 'gpt-5.4-mini')) return 2;
  if (isModelFamily(modelName, 'gpt-5.4')) return 2;
  if (isModelFamily(modelName, 'gpt-5.3-codex')) return 2;
  return 1;
};

// gpt-5.6 家族官方牌价：价格簿缺失/字段未配置时的兜底。
const getOfficialGpt56Price = (modelName: string | undefined): ModelPrice | undefined => {
  if (isModelFamily(modelName, 'gpt-5.6-sol')) {
    return { prompt: 5, completion: 30, cache: 0.5, cacheRead: 0.5, cacheCreation: 6.25 };
  }
  if (isModelFamily(modelName, 'gpt-5.6-terra')) {
    return { prompt: 2.5, completion: 15, cache: 0.25, cacheRead: 0.25, cacheCreation: 3.125 };
  }
  if (isModelFamily(modelName, 'gpt-5.6-luna')) {
    return { prompt: 1, completion: 6, cache: 0.1, cacheRead: 0.1, cacheCreation: 1.25 };
  }
  return undefined;
};

const findPrice = (
  model: string | undefined,
  prices: Record<string, ModelPrice>
): ModelPrice | undefined => {
  if (!model) return undefined;
  return prices[model] || prices[model.toLowerCase()] || undefined;
};

const selectContextTierPrice = (
  price: ModelPrice,
  inputTokens: number
): ModelPriceContextTier | undefined =>
  (price.contextTiers ?? []).reduce<ModelPriceContextTier | undefined>(
    (selected, candidate) =>
      inputTokens > (candidate.thresholdTokens || 0) &&
      (!selected || (candidate.thresholdTokens || 0) > (selected.thresholdTokens || 0))
        ? candidate
        : selected,
    undefined
  );

const selectServiceTierPrice = (
  price: ModelPrice,
  serviceTier?: string
): ModelPriceServiceTier | undefined => {
  const normalized = String(serviceTier ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  return (price.serviceTiers ?? []).find(
    (tier) => normalized === tier.mode || normalized === tier.serviceTier
  );
};

const applyTierPrice = (
  price: ModelPrice,
  tier: ModelPriceContextTier | ModelPriceServiceTier
): ModelPrice => ({
  ...price,
  prompt: tier.promptConfigured ? tier.prompt : price.prompt,
  completion: tier.completionConfigured ? tier.completion : price.completion,
  cache: tier.cacheConfigured ? tier.cache : price.cache,
  cacheRead: tier.cacheReadConfigured ? tier.cacheRead : price.cacheRead,
  cacheCreation: tier.cacheCreationConfigured ? tier.cacheCreation : price.cacheCreation,
  promptConfigured: tier.promptConfigured ? true : price.promptConfigured,
  completionConfigured: tier.completionConfigured ? true : price.completionConfigured,
  cacheReadConfigured: tier.cacheReadConfigured ? true : price.cacheReadConfigured,
  cacheCreationConfigured: tier.cacheCreationConfigured ? true : price.cacheCreationConfigured,
});

// codex 流量优先用请求侧档位，其他协议优先响应侧（与 cpamp calculateCost 一致）。
const selectEventServiceTier = (context: EventCostContext | undefined): string | undefined => {
  if (!context) return undefined;
  const identity = [context.executorType, context.provider, context.authProvider]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const { requestServiceTier, serviceTier, responseServiceTier } = context;
  return identity.includes('codex')
    ? (requestServiceTier || serviceTier || responseServiceTier)
    : (responseServiceTier || serviceTier || requestServiceTier);
};

/**
 * 按模型单价计算单次调用成本；无该模型价格时返回 null（UI 显示 --，不编造数值）。
 * 价格查找顺序与 cpamp 一致：resolved -> analytics -> requested。
 */
export const calculateEventCost = (
  model: string | undefined,
  requestedModel: string | undefined,
  resolvedModel: string | undefined,
  tokens: EventTokens,
  prices: Record<string, ModelPrice>,
  context?: EventCostContext
): number | null => {
  const resolvedPrice = findPrice(resolvedModel, prices);
  const analyticsPrice = findPrice(model, prices);
  const requestedPrice = findPrice(requestedModel, prices);
  const behaviorModel = resolvedModel || model || requestedModel;

  const configuredPrice = resolvedPrice || analyticsPrice || requestedPrice;
  const officialCandidatePrice =
    getOfficialGpt56Price(resolvedModel) ||
    getOfficialGpt56Price(model) ||
    getOfficialGpt56Price(requestedModel);
  if (!configuredPrice && !officialCandidatePrice) return null;

  const basePrice: ModelPrice = configuredPrice
    ? {
        ...configuredPrice,
        prompt: isConfiguredPriceValue(configuredPrice.prompt, configuredPrice.promptConfigured)
          ? configuredPrice.prompt
          : (officialCandidatePrice?.prompt ?? 0),
        completion: isConfiguredPriceValue(
          configuredPrice.completion,
          configuredPrice.completionConfigured
        )
          ? configuredPrice.completion
          : (officialCandidatePrice?.completion ?? 0),
      }
    : (officialCandidatePrice as ModelPrice);

  const serviceTier = selectEventServiceTier(context);
  const inputTokens = toFiniteNumber(tokens.inputTokens);
  const completionTokens = toFiniteNumber(tokens.outputTokens);
  const cachedTokens = toFiniteNumber(tokens.cachedTokens);
  const cacheReadTokens = toFiniteNumber(tokens.cacheReadTokens);
  const cacheCreationTokens = toFiniteNumber(tokens.cacheCreationTokens);

  const hasContextPricing = Boolean(basePrice.contextTiers?.length);
  const contextTier = selectContextTierPrice(basePrice, inputTokens);
  const longContext =
    !hasContextPricing && supportsLongContextPremium(behaviorModel) && inputTokens > 272_000;
  const normalizedServiceTier = String(serviceTier ?? '').trim().toLowerCase();
  const longContextOverridesServiceTier =
    longContext && (normalizedServiceTier === 'priority' || normalizedServiceTier === 'fast');
  const serviceTierPrice =
    !contextTier && !longContextOverridesServiceTier
      ? selectServiceTierPrice(basePrice, serviceTier)
      : undefined;
  const price = contextTier
    ? applyTierPrice(basePrice, contextTier)
    : serviceTierPrice
      ? applyTierPrice(basePrice, serviceTierPrice)
      : basePrice;

  const promptPrice = toFiniteNumber(price.prompt);
  const completionPrice = toFiniteNumber(price.completion);
  const cachePrice = toFiniteNumber(price.cache);
  const cacheReadPrice = isConfiguredPriceValue(price.cacheRead, price.cacheReadConfigured)
    ? toFiniteNumber(price.cacheRead)
    : isGpt56Model(behaviorModel)
      ? promptPrice * 0.1
      : cachePrice;
  const cacheCreationPrice = isConfiguredPriceValue(
    price.cacheCreation,
    price.cacheCreationConfigured
  )
    ? toFiniteNumber(price.cacheCreation)
    : promptPrice * (isGpt56Model(behaviorModel) ? 1.25 : 1);

  // 缓存命中部分从输入里扣除，避免与 prompt 单价重复计费（对齐 cpamp 口径）
  const readTokens = cachedTokens + cacheReadTokens;
  const promptTokens = Math.max(inputTokens - readTokens - cacheCreationTokens, 0);

  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  const standardCost =
    ((promptTokens / TOKENS_PER_PRICE_UNIT) * promptPrice +
      (cachedTokens / TOKENS_PER_PRICE_UNIT) * cachePrice +
      (cacheReadTokens / TOKENS_PER_PRICE_UNIT) * cacheReadPrice +
      (cacheCreationTokens / TOKENS_PER_PRICE_UNIT) * cacheCreationPrice) *
      inputMultiplier +
    (completionTokens / TOKENS_PER_PRICE_UNIT) * completionPrice * outputMultiplier;

  // 显式阶梯/档位价已含倍率，只有兜底路径才乘档位倍率。
  const multiplier =
    longContextOverridesServiceTier || contextTier || serviceTierPrice
      ? 1
      : getServiceTierMultiplier(behaviorModel, serviceTier);
  const total = standardCost * multiplier;

  return Number.isFinite(total) && total > 0 ? total : 0;
};
