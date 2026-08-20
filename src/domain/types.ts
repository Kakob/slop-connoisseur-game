/** Core entity types for Slop Connoisseur (SPEC-prototype.md §10–§15, §32). */

// ---------------------------------------------------------------------------
// Prompts (§10, §11)
// ---------------------------------------------------------------------------

export type PromptSource = "curated" | "user" | "generated";

export type GamePrompt = {
  id: string;
  text: string;
  source: PromptSource;
  parentPromptId?: string;
  tags: string[];
  /** Analysis metadata, never player-facing categories (§10). */
  hypotheses: string[];
  active: boolean;
  createdAt: string;
};

export type PromptDerivation = {
  id: string;
  parentPromptId: string;
  childPromptId: string;
  operation: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Contestants and personas (§6, §7)
// ---------------------------------------------------------------------------

export type ContestantKind = "human" | "machine";

export type Contestant = {
  id: string;
  kind: ContestantKind;
  /** Machine contestants reference a persona; humans do not. */
  personaId?: string;
  personaVersion?: number;
  displayName: string;
  createdAt: string;
};

export type PersonaTendencies = {
  verbosity: number;
  humor: number;
  formality: number;
  confidence: number;
  selfDisclosure: number;
  specificity: number;
  tendencyToExplain: number;
  editingIntensity: number;
};

export type Persona = {
  id: string;
  version: number;
  name: string;
  /** Free-prose voice description handed to the writer/judge context. */
  voice: string;
  tendencies: PersonaTendencies;
  tastePreferences: string[];
  persistentFacts: string[];
};

// ---------------------------------------------------------------------------
// Specimens, derivations, appearances (§12–§14)
// ---------------------------------------------------------------------------

export type SpecimenModelMetadata = {
  provider: string;
  model: string;
  modelVersion?: string;
  strategyId: string;
  strategyVersion: number;
  personaId: string;
  personaVersion: number;
  /** Generation latency in milliseconds, preserved for future analysis (§22). */
  latencyMs?: number;
};

export type Specimen = {
  id: string;
  text: string;
  creatorType: "human" | "model";
  /** The contestant that produced this specimen — server-side provenance (§33). */
  creatorContestantId: string;
  promptId: string;
  createdAt: string;
  wordCount: number;
  /** True only for the empty-timeout artifact (§5 Blank submissions). */
  isBlank: boolean;
  reuseAllowed: boolean;
  modelMetadata?: SpecimenModelMetadata;
};

export type DerivationOperation =
  | "imitate"
  | "humanize"
  | "slopify"
  | "rewrite"
  | "style-transfer"
  | "other";

export type SpecimenDerivation = {
  id: string;
  parentSpecimenId: string;
  childSpecimenId: string;
  operation: DerivationOperation;
  strategyId?: string;
  strategyVersion?: number;
  createdAt: string;
};

export type Appearance = {
  id: string;
  roundId: string;
  specimenId: string;
  /** 0-based table position after the server-side shuffle; shown as A–F. */
  anonymousPosition: number;
  eligibleForDetection: boolean;
  eligibleForTaste: boolean;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Judgments (§15)
// ---------------------------------------------------------------------------

export type JudgmentType = "human-detection" | "machine-detection" | "taste";

export type Judgment = {
  id: string;
  roundId: string;
  judgeContestantId: string;
  type: JudgmentType;
  chosenAppearanceId: string;
  createdAt: string;
  judgeMetadata?: {
    model?: string;
    personaId?: string;
    personaVersion?: number;
    strategyId?: string;
    strategyVersion?: number;
  };
};

/** A judge that permanently failed after retries — recorded, never fabricated (§27). */
export type FailedJudgment = {
  id: string;
  roundId: string;
  judgeContestantId: string;
  type: JudgmentType;
  error: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Rounds (§5)
// ---------------------------------------------------------------------------

export type RoundPhase =
  | "READY"
  | "PROMPT_REVEALED"
  | "WRITING"
  | "SUBMISSIONS_LOCKED"
  | "WAITING_FOR_MACHINE_RESPONSES"
  | "JUDGING"
  | "JUDGMENTS_LOCKED"
  | "REVEAL"
  | "RESULTS";

export type RoundMode = "hide-from-machines" | "find-the-machine";

export type Round = {
  id: string;
  mode: RoundMode;
  promptId: string;
  phase: RoundPhase;
  humanContestantId: string;
  machineContestantIds: string[];
  /** Response-time record (§20). */
  timings: {
    promptShownAt?: string;
    humanStartedTypingAt?: string;
    humanSubmittedAt?: string;
    humanResponseMilliseconds?: number;
  };
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Strategies (§23)
// ---------------------------------------------------------------------------

export type StrategyRole = "writer" | "detection" | "taste";

export type StrategyVersionRecord = {
  id: string;
  role: StrategyRole;
  version: number;
  description: string;
};

// ---------------------------------------------------------------------------
// Events (§21)
// ---------------------------------------------------------------------------

export type GameEventType =
  | "round_started"
  | "prompt_shown"
  | "typing_started"
  | "human_submitted"
  | "human_timed_out_blank"
  | "machine_generation_started"
  | "machine_generated"
  | "machine_generation_failed"
  | "submissions_locked"
  | "judging_started"
  | "judgment_cast"
  | "judgment_failed"
  | "judgments_locked"
  | "provenance_revealed"
  | "round_completed";

export type GameEvent = {
  id: string;
  roundId: string;
  type: GameEventType;
  at: string;
  /** Event-specific IDs and detail; never the only record of raw outcomes. */
  data: Record<string, unknown>;
};
