/** Central game tunables (SPEC §4). Game laws live in code structure, not here. */

export type RiskTier = {
  name: string;
  min: number;
  max: number;
  multiplier: number;
};

export type Tunables = {
  humanWritingSeconds: number;
  maxResponseWords: number;
  riskTiers: RiskTier[];
  machineContestantCount: number;

  scoring: {
    /** deceptionPoints = deceptionBase * deceptionRate * lengthMultiplier (§18). */
    deceptionBase: number;
    /** Minimum successful machine judges required to score a round (§27). */
    minJudgeCount: number;
  };

  combos: {
    /** Deception rate at/above which Safe Slop / Ghost Streak style combos apply. */
    highDeceptionRate: number;
    /** Taste rate at/below which "low taste" applies (Safe Slop). */
    lowTasteRate: number;
    /** Taste rate at/above which "meaningful taste support" applies (Dangerous Goods, Palate Streak). */
    meaningfulTasteRate: number;
    /** Consecutive qualifying rounds needed for Ghost Streak / Palate Streak. */
    streakLength: number;
  };

  retries: {
    generation: number;
    judgment: number;
  };

  provider: {
    name: string;
    model: string;
    /** Token headroom for short responses plus adaptive thinking. */
    maxTokens: number;
  };

  /** How the next prompt is chosen from active seed prompts. */
  promptSelection: "random-unplayed-first" | "random";
};

export const defaultTunables: Tunables = {
  humanWritingSeconds: 45,
  maxResponseWords: 70,
  riskTiers: [
    { name: "SAFE", min: 1, max: 15, multiplier: 1.0 },
    { name: "BOLD", min: 16, max: 35, multiplier: 1.25 },
    { name: "DANGEROUS", min: 36, max: 70, multiplier: 1.6 },
  ],
  machineContestantCount: 5,

  scoring: {
    deceptionBase: 100,
    minJudgeCount: 3,
  },

  combos: {
    highDeceptionRate: 0.8,
    lowTasteRate: 0.2,
    meaningfulTasteRate: 0.4,
    streakLength: 3,
  },

  retries: {
    generation: 2,
    judgment: 2,
  },

  provider: {
    name: "anthropic",
    model: "claude-opus-5",
    maxTokens: 4000,
  },

  promptSelection: "random-unplayed-first",
};
