/** Length-risk derivation (SPEC §18): final word count mechanically determines risk. */

import type { RiskTier } from "../config/tunables.js";

/**
 * Derives the risk tier for a word count, or null for a blank (0 words),
 * which receives no length-risk multiplier (SPEC §5).
 */
export function riskTierFor(wordCount: number, tiers: RiskTier[]): RiskTier | null {
  if (wordCount === 0) return null;
  const tier = tiers.find((t) => wordCount >= t.min && wordCount <= t.max);
  if (!tier) {
    throw new Error(`No risk tier covers word count ${wordCount}; check tunables.riskTiers`);
  }
  return tier;
}
