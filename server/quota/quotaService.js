// server/quota/quotaService.js — Token Quota, Rate Limiting & Usage Metering Service
const { UsageModel, UserModel } = require('../db');

// Multi-Tier Plan Configurations
const PLAN_LIMITS = {
  free: {
    tierName: 'Free Plan',
    badgeColor: 'amber',
    dailyGenerations: 5,
    dailyEdits: 20,
    dailyRepairs: 10,
    dailyTokenBudget: 100000,
    maxProjectFiles: 20
  },
  pro: {
    tierName: 'Pro Developer Plan',
    badgeColor: 'emerald',
    dailyGenerations: 100,
    dailyEdits: 500,
    dailyRepairs: 200,
    dailyTokenBudget: 2000000,
    maxProjectFiles: 100
  }
};

/**
 * Get limits for a given plan tier
 */
function getPlanLimits(tier = 'free') {
  const cleanTier = (tier && PLAN_LIMITS[tier.toLowerCase()]) ? tier.toLowerCase() : 'free';
  return PLAN_LIMITS[cleanTier];
}

/**
 * Calculate seconds until next midnight UTC reset
 */
function getSecondsUntilReset() {
  const now = new Date();
  const nextReset = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0
  ));
  return Math.max(0, Math.ceil((nextReset.getTime() - now.getTime()) / 1000));
}

/**
 * Retrieve comprehensive quota and usage metrics for a user
 */
function getUserQuotaStatus(user) {
  if (!user || !user.id) {
    throw new Error('User context is required to determine quota status.');
  }

  const baseLimits = getPlanLimits(user.plan_tier);
  const limits = {
    ...baseLimits,
    dailyGenerations: (user.custom_daily_quota && user.custom_daily_quota > 0)
      ? user.custom_daily_quota
      : baseLimits.dailyGenerations
  };

  const todayUsage = UsageModel.getTodayUsage(user.id);
  const secondsUntilReset = getSecondsUntilReset();
  const nextResetDate = new Date(Date.now() + secondsUntilReset * 1000).toISOString();

  const remainingGenerations = Math.max(0, limits.dailyGenerations - todayUsage.generations_today);
  const remainingEdits = Math.max(0, limits.dailyEdits - todayUsage.edits_today);
  const remainingRepairs = Math.max(0, limits.dailyRepairs - todayUsage.repairs_today);
  const remainingTokens = Math.max(0, limits.dailyTokenBudget - todayUsage.total_tokens);

  const generationUsagePercent = limits.dailyGenerations > 0
    ? Math.min(100, Math.round((todayUsage.generations_today / limits.dailyGenerations) * 100))
    : 0;

  const tokenUsagePercent = limits.dailyTokenBudget > 0
    ? Math.min(100, Math.round((todayUsage.total_tokens / limits.dailyTokenBudget) * 100))
    : 0;

  return {
    tier: user.plan_tier || 'free',
    tierName: limits.tierName,
    badgeColor: limits.badgeColor,
    limits: {
      dailyGenerations: limits.dailyGenerations,
      dailyEdits: limits.dailyEdits,
      dailyRepairs: limits.dailyRepairs,
      dailyTokenBudget: limits.dailyTokenBudget,
      maxProjectFiles: limits.maxProjectFiles
    },
    todayUsage: {
      totalOperations: todayUsage.total_operations,
      generationsToday: todayUsage.generations_today,
      editsToday: todayUsage.edits_today,
      repairsToday: todayUsage.repairs_today,
      promptTokens: todayUsage.prompt_tokens,
      completionTokens: todayUsage.completion_tokens,
      totalTokens: todayUsage.total_tokens
    },
    remaining: {
      generations: remainingGenerations,
      edits: remainingEdits,
      repairs: remainingRepairs,
      tokens: remainingTokens
    },
    percentages: {
      generationUsage: generationUsagePercent,
      tokenUsage: tokenUsagePercent
    },
    resetsAt: nextResetDate,
    resetsInSeconds: secondsUntilReset
  };
}

/**
 * Pre-flight check: Verifies if user has remaining quota before executing an LLM request
 */
function checkQuota(user, operation = 'generate') {
  const status = getUserQuotaStatus(user);

  if (operation === 'generate' && status.remaining.generations <= 0) {
    const hours = Math.ceil(status.resetsInSeconds / 3600);
    return {
      allowed: false,
      error: 'DAILY_QUOTA_EXCEEDED',
      message: `You have reached your daily limit of ${status.limits.dailyGenerations} AI generations on the ${status.tierName}. Quota resets in ${hours} hours. Upgrade to Pro for 100 generations per day.`,
      status
    };
  }

  if (operation === 'chat_edit' && status.remaining.edits <= 0) {
    const hours = Math.ceil(status.resetsInSeconds / 3600);
    return {
      allowed: false,
      error: 'DAILY_QUOTA_EXCEEDED',
      message: `You have reached your daily chat update limit (${status.limits.dailyEdits} edits). Resets in ${hours} hours.`,
      status
    };
  }

  if (operation === 'diagnose_repair' && status.remaining.repairs <= 0) {
    const hours = Math.ceil(status.resetsInSeconds / 3600);
    return {
      allowed: false,
      error: 'DAILY_QUOTA_EXCEEDED',
      message: `You have reached your daily automated repair limit (${status.limits.dailyRepairs} repairs). Resets in ${hours} hours.`,
      status
    };
  }

  if (status.remaining.tokens <= 0) {
    return {
      allowed: false,
      error: 'TOKEN_BUDGET_EXCEEDED',
      message: `You have reached your daily token budget (${status.limits.dailyTokenBudget.toLocaleString()} tokens).`,
      status
    };
  }

  return {
    allowed: true,
    status
  };
}

/**
 * Record usage immediately after LLM execution
 */
function recordOperationUsage({
  userId,
  projectId = null,
  operation = 'generate',
  provider = 'gemini',
  model = 'gemini-2.5-flash',
  promptText = '',
  outputText = '',
  promptTokens = null,
  completionTokens = null,
  totalTokens = null
}) {
  // Approximate tokens if exact counts not provided by stream
  const pTokens = promptTokens !== null ? promptTokens : Math.ceil((promptText ? promptText.length : 0) / 4);
  const cTokens = completionTokens !== null ? completionTokens : Math.ceil((outputText ? outputText.length : 0) / 4);
  const tTokens = totalTokens !== null ? totalTokens : (pTokens + cTokens);

  return UsageModel.recordUsage({
    userId,
    projectId,
    operation,
    provider,
    model,
    promptTokens: pTokens,
    completionTokens: cTokens,
    totalTokens: tTokens
  });
}

module.exports = {
  PLAN_LIMITS,
  getPlanLimits,
  getUserQuotaStatus,
  checkQuota,
  recordOperationUsage
};
