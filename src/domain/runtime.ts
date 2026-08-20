/** Injected clock, id generation, and seeded randomness — all nondeterminism enters here. */

import { randomUUID } from "node:crypto";

export type Clock = () => number;

export type IdGen = () => string;

export type Rng = () => number;

/** Derives an ISO-8601 timestamp from an injected clock. */
export function isoNow(clock: Clock): string {
  return new Date(clock()).toISOString();
}

/** Real wall clock for production use. */
export const systemClock: Clock = () => Date.now();

/** Real UUID generator for production use. */
export const systemIdGen: IdGen = () => randomUUID();

/** Deterministic mulberry32 RNG seeded for reproducible shuffles in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cryptographically-seeded RNG for production shuffles (§33 server-side randomness). */
export function systemRng(): Rng {
  return seededRng(Math.floor(Math.random() * 2 ** 32));
}

/** Fisher–Yates shuffle returning a new array; source of anonymous ordering. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Sequential deterministic id generator for tests. */
export function testIdGen(prefix = "id"): IdGen {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** Fixed, manually-advanceable clock for tests. */
export function testClock(startMs = 1_700_000_000_000): Clock & { advance: (ms: number) => void } {
  let now = startMs;
  const clock = (() => now) as Clock & { advance: (ms: number) => void };
  clock.advance = (ms: number) => {
    now += ms;
  };
  return clock;
}
