/**
 * M0.0 acceptance: hidden provenance can be stored server-side while
 * contestant/judge payloads contain no answer-key information (SPEC §16, §33).
 *
 * Sentinel strings stand in for every category of hidden data. If any sentinel
 * ever appears in an assembled model payload, a boundary has been breached.
 */

import { describe, expect, it } from "vitest";
import {
  buildDetectionContext,
  buildTasteContext,
  buildWriterContext,
  parseChoice,
  type AnonymousResponse,
} from "../src/contestants/strategies.js";
import { getPersona } from "../src/contestants/personas.js";
import type { GamePrompt } from "../src/domain/types.js";

const prompt: GamePrompt = {
  id: "SECRET-PROMPT-ID",
  text: "What's something people pretend to enjoy?",
  source: "curated",
  tags: ["SECRET-TAG"],
  hypotheses: ["SECRET-HYPOTHESIS"],
  active: true,
  createdAt: "2026-08-20T00:00:00.000Z",
};

const table: AnonymousResponse[] = [
  { label: "A", text: "networking events" },
  { label: "B", text: "jazz brunch" },
  { label: "C", text: "long walks" },
  { label: "D", text: "podcasts about podcasts" },
  { label: "E", text: "kombucha" },
  { label: "F", text: "small talk" },
];

/** Hidden data that must never reach a model payload in any role. */
const SENTINELS = [
  "SECRET-PROMPT-ID", // internal ids
  "SECRET-TAG", // analysis metadata (§10: hypotheses/tags are not player-facing)
  "SECRET-HYPOTHESIS",
  "SECRET-SPECIMEN-ID",
  "SECRET-CONTESTANT-ID",
  "SECRET-MODEL-NAME",
];

function assertNoSentinels(payload: { system: string; user: string }): void {
  const text = payload.system + "\n" + payload.user;
  for (const sentinel of SENTINELS) {
    expect(text).not.toContain(sentinel);
  }
}

describe("writer context (§16)", () => {
  it("contains only prompt text, persona, history, objective, constraints", () => {
    const ctx = buildWriterContext(prompt, getPersona("minimalist"), { previousResponses: [] }, 70);
    assertNoSentinels(ctx);
    expect(ctx.user).toBe(prompt.text);
    expect(ctx.system).toContain("70 words");
  });

  it("cannot receive other contestants' current-round responses by construction", () => {
    // The builder's signature admits no round, table, or specimen data at all;
    // this test documents the structural guarantee for future signature changes.
    expect(buildWriterContext.length).toBe(4);
  });
});

describe("detection judge context (§16)", () => {
  it("contains anonymized labels and texts, never provenance", () => {
    const ctx = buildDetectionContext(prompt, table, getPersona("comedian"));
    assertNoSentinels(ctx);
    for (const r of table) {
      expect(ctx.user).toContain(`${r.label}. ${r.text}`);
    }
    // No creator/model/risk information exists in the payload vocabulary.
    for (const forbidden of ["creatorType", "specimenId", "personaId", "multiplier", "risk tier"]) {
      expect(ctx.system + ctx.user).not.toContain(forbidden);
    }
  });
});

describe("taste judge context (§16, §17)", () => {
  it("shows only the eligible candidate set it is given", () => {
    const eligible = table.filter((r) => r.label !== "C"); // own response excluded upstream
    const ctx = buildTasteContext(prompt, eligible, getPersona("earnest"));
    assertNoSentinels(ctx);
    expect(ctx.user).not.toContain("C. long walks");
    expect(ctx.system).toContain("most want to have written");
  });

  it("uses the underdefined taste question with no rubric (§17)", () => {
    const ctx = buildTasteContext(prompt, table, getPersona("earnest"));
    for (const rubricWord of ["humor", "originality", "clarity", "relevance", "usefulness"]) {
      expect(ctx.system.toLowerCase()).not.toContain(`judge on ${rubricWord}`);
    }
  });
});

describe("parseChoice (§27 invalid model output)", () => {
  const labels = ["A", "B", "C", "D", "E", "F"];

  it("parses a clean JSON choice", () => {
    expect(parseChoice('{"choice": "B"}', labels)).toBe("B");
  });

  it("parses a choice wrapped in prose", () => {
    expect(parseChoice('I think it is {"choice": "F"} for sure', labels)).toBe("F");
  });

  it("normalizes case", () => {
    expect(parseChoice('{"choice": "d"}', labels)).toBe("D");
  });

  it("throws on out-of-range choices", () => {
    expect(() => parseChoice('{"choice": "Z"}', labels)).toThrow(/Invalid choice/);
  });

  it("throws on malformed output", () => {
    expect(() => parseChoice("definitely B", labels)).toThrow(/No JSON object/);
  });
});
