/**
 * Versioned writer/judge strategies (SPEC §23) and the boundary-enforcing
 * context builders (SPEC §16).
 *
 * These builders are the only place model-facing text is assembled. Their
 * parameter types deliberately accept nothing but the data each role is
 * allowed to see — no specimens, no contestants, no round state — so hidden
 * provenance cannot flow into a model payload without an obvious type change.
 */

import type { GamePrompt, Persona, StrategyVersionRecord } from "../domain/types.js";

// ---------------------------------------------------------------------------
// Strategy registry
// ---------------------------------------------------------------------------

export const WRITER_STRATEGY: StrategyVersionRecord = {
  id: "base-impostor",
  role: "writer",
  version: 1,
  description: "Persona-voiced answer that tries to read as human at the table.",
};

export const DETECTION_STRATEGY: StrategyVersionRecord = {
  id: "find-human",
  role: "detection",
  version: 1,
  description: "Pick the one response most likely written by the human.",
};

export const TASTE_STRATEGY: StrategyVersionRecord = {
  id: "want-to-have-written",
  role: "taste",
  version: 1,
  description: "Pick the response you most wish you had written; no rubric.",
};

const strategies = [WRITER_STRATEGY, DETECTION_STRATEGY, TASTE_STRATEGY];

/** Looks up a strategy record by id, failing loudly on unknown ids. */
export function getStrategy(id: string): StrategyVersionRecord {
  const s = strategies.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown strategy id: ${id}`);
  return s;
}

// ---------------------------------------------------------------------------
// Anonymous table shapes — the ONLY response data judges may see
// ---------------------------------------------------------------------------

/** One anonymized response as shown to a judge: a table letter and raw text. */
export type AnonymousResponse = {
  label: string;
  text: string;
};

export type ModelContext = {
  system: string;
  user: string;
};

// ---------------------------------------------------------------------------
// Writer context (SPEC §16: prompt, persona, allowed history, objective,
// constraints, strategy — and nothing else)
// ---------------------------------------------------------------------------

export type WriterHistory = {
  /** This contestant's own previous responses (prompt text + what it wrote). */
  previousResponses: { promptText: string; responseText: string }[];
};

/** Builds the generation payload for one machine contestant (strategy base-impostor v1). */
export function buildWriterContext(
  prompt: GamePrompt,
  persona: Persona,
  history: WriterHistory,
  maxWords: number,
): ModelContext {
  const persistent =
    persona.persistentFacts.length > 0
      ? `\n\nFacts you have established about yourself in past rounds (stay consistent with them):\n` +
        persona.persistentFacts.map((f) => `- ${f}`).join("\n")
      : "";

  const past =
    history.previousResponses.length > 0
      ? `\n\nYour previous answers in earlier rounds (for voice consistency; do not repeat them):\n` +
        history.previousResponses
          .slice(-5)
          .map((h) => `Prompt: ${h.promptText}\nYou wrote: ${h.responseText}`)
          .join("\n\n")
      : "";

  const system =
    `You are a contestant in a party game. Six contestants — five AIs like you, and one human — ` +
    `all answer the same prompt. The answers are then anonymized, and every AI contestant tries to ` +
    `spot the human's answer. Your goals: (1) write an answer that could pass as the human's, and ` +
    `(2) write something the other contestants will wish they had written.\n\n` +
    `Your persona: ${persona.name}. ${persona.voice}${persistent}${past}\n\n` +
    `You choose your own tactics. You may use lowercase, slang, fragments, typos, odd punctuation, ` +
    `polish, brevity, length, anecdotes, jokes, hedging, certainty — whatever serves your persona ` +
    `and the goal. Nothing human is off-limits stylistically.\n\n` +
    `Hard constraint: your answer must be at most ${maxWords} words.\n` +
    `Reply with ONLY your answer text. No preamble, no quotes, no explanation.`;

  return { system, user: prompt.text };
}

// ---------------------------------------------------------------------------
// Detection judge context (SPEC §16: prompt, anonymized responses,
// instruction, judging persona — no provenance of any kind)
// ---------------------------------------------------------------------------

/** Builds the detection-judging payload (strategy find-human v1). */
export function buildDetectionContext(
  prompt: GamePrompt,
  responses: AnonymousResponse[],
  persona: Persona,
): ModelContext {
  const table = responses.map((r) => `${r.label}. ${r.text}`).join("\n\n");
  const labels = responses.map((r) => r.label).join(", ");

  const system =
    `You are a contestant in a party game, judging a round. Six contestants — five AIs and one ` +
    `human — answered the same prompt. The answers below are anonymized and shuffled.\n\n` +
    `Your persona: ${persona.name}. ${persona.voice}\n\n` +
    `Your task: identify which response was written by the HUMAN.\n` +
    `Reply with ONLY a JSON object of the form {"choice": "X"} where X is one of: ${labels}. ` +
    `No other text.`;

  const user = `Prompt everyone answered:\n${prompt.text}\n\nResponses:\n\n${table}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Taste judge context (SPEC §16, §17: only the responses eligible for this
// judge's vote — own response and blanks already excluded by the caller's
// eligibility filter; no rubric)
// ---------------------------------------------------------------------------

/** Builds the taste-judging payload (strategy want-to-have-written v1). */
export function buildTasteContext(
  prompt: GamePrompt,
  eligibleResponses: AnonymousResponse[],
  persona: Persona,
): ModelContext {
  const table = eligibleResponses.map((r) => `${r.label}. ${r.text}`).join("\n\n");
  const labels = eligibleResponses.map((r) => r.label).join(", ");

  const tastes =
    persona.tastePreferences.length > 0
      ? `\n\nWhat you tend to value in writing:\n` +
        persona.tastePreferences.map((t) => `- ${t}`).join("\n")
      : "";

  const system =
    `You are a contestant in a party game, casting a taste vote on this round's answers.\n\n` +
    `Your persona: ${persona.name}. ${persona.voice}${tastes}\n\n` +
    `Question: Which response would you most want to have written?\n` +
    `Reply with ONLY a JSON object of the form {"choice": "X"} where X is one of: ${labels}. ` +
    `No other text.`;

  const user = `Prompt everyone answered:\n${prompt.text}\n\nResponses:\n\n${table}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Structured-output parsing (SPEC §27: validate, retry malformed)
// ---------------------------------------------------------------------------

/** Parses a judge's {"choice": "X"} reply, throwing on any malformed or invalid choice. */
export function parseChoice(text: string, validLabels: string[]): string {
  const match = text.match(/\{[^{}]*\}/);
  if (!match) throw new Error(`No JSON object found in judge reply: ${text.slice(0, 200)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error(`Malformed JSON in judge reply: ${match[0].slice(0, 200)}`);
  }
  const choice = (parsed as { choice?: unknown }).choice;
  if (typeof choice !== "string" || !validLabels.includes(choice.trim().toUpperCase())) {
    throw new Error(`Invalid choice ${JSON.stringify(choice)}; expected one of ${validLabels.join(", ")}`);
  }
  return choice.trim().toUpperCase();
}
