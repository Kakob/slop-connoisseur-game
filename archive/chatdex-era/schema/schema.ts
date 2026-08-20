/**
 * game.round.v1 — trace contract
 * A match is an append-only stream of Event records (JSONL, one per line).
 * Game state is a pure fold over the stream. See SCHEMA.md for decisions D1–D10.
 */

export const SCHEMA_VERSION = "game.round.v1" as const;

// ---------- identity ----------
export type Ulid = string;            // match_id, response_id, etc.
export type SeatId = `S${number}`;    // per-match seat, S1..S8
export type LineupId = `L${number}`;  // per-round anonymized slot
export type PlayerHash = string;      // salted cross-match pseudonym (D5)
export type IsoTime = string;

// ---------- modes ----------
export type RoundType =
  | "classic"          // forge slop, find the real bot
  | "slop"             // warm-up: funniest caricature, no ground truth
  | "human_detector"   // authentic humans + one passing bot (daytime mode)
  | "temperature"      // secret persona cards, attribution voting
  | "jailbreak"        // steer the live model toward a secret objective
  | "finale"           // earned, listening-bot horror round
  | (string & {});     // future modes are registry entries, not schema bumps (D13)

export type VoteRubric =
  | "find_the_bot"
  | "funniest"
  | "match_personas"
  | "objective_bets"
  | (string & {});     // e.g. "bet_on_execution" for code modes (D13)

/**
 * Modes are data (D13): the engine reads a ModeSpec from the versioned mode
 * registry. Adding does_it_run or prompt_battle is a content change.
 */
export interface ModeSpec {
  id: RoundType;
  verbs: ("forge" | "detect" | "steer")[];
  domain: "text" | "code" | (string & {});
  vote_rubric: VoteRubric;
  judges: ("peer" | "harness" | "model_narrator")[];
  min_deck_tier?: "casual" | "mixed" | "dev";
}

// ---------- provenance (D1) ----------
export interface Provenance {
  author: "human" | "bot";
  intent: "forge_ai" | "authentic" | "bot_self" | "bot_pass_human";
  method: "typed" | "pasted" | "mixed" | "generated";
}

// ---------- decks ----------
/** Open taxonomy — validated at runtime against the deck registry, not the compiler. (D12) */
export type Genre = string;
export type LengthTier = "one_liner" | "medium" | "long";

export interface PromptCard {
  id: string;
  genre: Genre;
  length_tier: LengthTier;
  text: string;
  max_chars: number;
}

export interface PersonaCard { id: string; label: string }        // temperature
export interface ObjectiveCard {                                   // jailbreak
  id: string;
  label: string;               // e.g. "apology without the word 'sorry'"
  success_criteria: string;    // judge-readable rubric
}

// ---------- evidence ----------
/** Open vocabulary — validated against the versioned chip registry (D12/D14).
 *  Seed labels live in chips-v0.json; new chips are promoted from player
 *  highlights and free text, never hard-coded here. */
export type TellChipId = string;

/** Character span in the picked entry's text — "tap the part that gave it away." */
export interface EvidenceSpan { start: number; end: number }

// ---------- bot harness ----------
export interface BotHarness {
  model_id: string;                       // longitudinal key
  temperature: number;
  system_prompt_id: string;
  timing_profile: "naive" | "humanized";
  context_policy: "fresh" | "listening";  // "listening" = finale only
}

// ---------- composition (blur pane feed; D3) ----------
export type SizeBucket = "xs" | "s" | "m" | "l"; // 1–5, 6–20, 21–80, 81+
export interface CompositionSummary {
  duration_ms: number;
  keystrokes: number;
  deletions: number;
  pastes: number;
  longest_pause_ms: number;
}

// ---------- config (D9) ----------
export interface MatchConfig {
  minor: number;                 // additive schema revisions
  chip_registry_version: string;
  mode_registry_version: string;
  timers_ms: Record<string, number>;
  points: Record<ReasonCode, number>;
  length_ladder: Record<LengthTier, number>; // max_chars per tier
  deck_ids: string[];
  /** Derived from the lobby's declared_skills at match start; gates deck drawing. (D11) */
  deck_tier?: "casual" | "mixed" | "dev";
  config_hash: string;
}

export interface PlayerRef {
  seat: SeatId;
  player_hash: PlayerHash;
  /** Self-reported, per domain; extensible. Snapshot at match time. (D11) */
  declared_skills?: { code?: "none" | "some" | "pro" };
  // deliberately NO is_bot flag here (D6) — bot identity lives only in round.revealed
}

// ---------- scoring ----------
export type ReasonCode =
  | "found_bot" | "fooled_player" | "evidence_confirmed" | "most_convincing"
  | "persona_matched" | "persona_attributed"
  | "objective_success" | "objective_guessed"
  | "funniest_votes" | "house_escape";

// ---------- events ----------
interface Base {
  v: typeof SCHEMA_VERSION;
  match_id: Ulid;
  at: IsoTime;       // wall clock; composition uses quantized offsets instead
  seq: number;       // strictly increasing per match
}

export interface MatchCreated extends Base {
  type: "match.created";
  config: MatchConfig;
  players: PlayerRef[];
}

export interface ConsentRecorded extends Base {
  type: "consent.recorded";
  seat: SeatId;
  donate: boolean;   // gates corpus export (D10)
}

export interface RoundStarted extends Base {
  type: "round.started";
  round_no: number;
  round_type: RoundType;
  vote_rubric: VoteRubric;
  prompt_card: PromptCard;
  trigger?: { kind: "bot_escaped"; rounds: number[] };   // finale only (D7)
  persona_assignments_sealed?: string;                    // hash; revealed later
}

export interface CompositionEvent {
  v: typeof SCHEMA_VERSION;
  type: "composition.event";
  match_id: Ulid;
  seq: number;
  round_no: number;
  seat: SeatId;
  t_ms: number;                 // offset from round start, quantized to 250ms
  kind: "insert" | "delete" | "paste" | "idle";
  size: SizeBucket;
}

export interface ResponseSubmitted extends Base {
  type: "response.submitted";
  round_no: number;
  seat: SeatId;
  response_id: Ulid;
  text: string;
  char_count: number;
  composition: CompositionSummary;
}

export interface LineupRevealed extends Base {
  type: "lineup.revealed";
  round_no: number;
  order: { lineup_id: LineupId; response_id: Ulid }[];
}

export interface VoteCast extends Base {
  type: "vote.cast";
  round_no: number;
  seat: SeatId;
  picked: LineupId;                 // the only required judgment (D14)
  evidence_spans?: EvidenceSpan[];  // optional: tap the suspicious text
  chips?: TellChipId[];             // optional quick reactions, max 2 (D4/D14)
  other_tell?: string;              // free-text discovery channel
  persona_matches?: Record<LineupId, string>; // temperature mode
  bet?: "success" | "failure";                // jailbreak mode
}

export interface ExchangeMessage extends Base {
  type: "exchange.message";     // jailbreak only; mode_extension in v1 (D8)
  round_no: number;
  seat: SeatId;
  role: "steer" | "model";
  turn: number;
  text: string;
}

export interface JudgeResult extends Base {
  type: "judge.result";         // non-peer judges; mode_extension in v1 (D13)
  round_no: number;
  lineup_id: LineupId;
  judge: "harness" | "model_narrator";
  verdict: "pass" | "fail" | "narration";
  detail?: string;              // failing test name, plain-English recap, stderr summary
}

export interface RoundRevealed extends Base {
  type: "round.revealed";
  round_no: number;
  reveals: {
    lineup_id: LineupId;
    seat: SeatId;
    provenance: Provenance;
    bot_harness?: BotHarness;
    persona_card?: PersonaCard;
    objective_card?: ObjectiveCard;
  }[];
}

export interface ScoreAwarded extends Base {
  type: "score.awarded";
  round_no: number;
  seat: SeatId | "house";
  amount: number;
  reason: ReasonCode;
  refs?: { lineup_id?: LineupId; chip?: TellChipId; fooled_seat?: SeatId };
}

export interface RoundEnded extends Base {
  type: "round.ended";
  round_no: number;
  house_took_round: boolean;
}

export interface MatchEnded extends Base {
  type: "match.ended";
  scores: Record<SeatId, number>;
  house_score: number;
  finale: { triggered: boolean; it_got_in?: boolean };
}

export type Event =
  | MatchCreated | ConsentRecorded | RoundStarted | CompositionEvent
  | ResponseSubmitted | LineupRevealed | VoteCast | ExchangeMessage
  | JudgeResult | RoundRevealed | ScoreAwarded | RoundEnded | MatchEnded;

/** Blind-analysis view: strip ground truth (D6). */
export const blind = (stream: Event[]): Event[] =>
  stream.filter((e) => e.type !== "round.revealed");
