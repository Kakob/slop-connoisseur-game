/** Types for creature.js (the browser module has no build step). */

export type Stakes = { riskTiers: { name: string; min: number; max: number; multiplier: number }[]; deceptionBase: number };
export type CreatureKind = "blank" | "safe" | "bold" | "dangerous";
export type Creature = {
  kind: CreatureKind;
  words: number;
  tier: string | null;
  multiplier: number;
  base: number;
  maxPoints: number;
  traits: { hue: number; eyes: number; pattern: number; crest: number; tilt: number };
};

export function wordCount(text: string): number;
export function textHash(text: string): number;
export function creatureFor(text: string, stakes?: Partial<Stakes>): Creature;
export function pointsFor(creature: Creature, found: number, of: number): number;
export function stakeTag(creature: Creature): string;
export function creatureSvg(creature: Creature): string;
