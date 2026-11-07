import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { defaultTunables } from "../src/config/tunables.js";
import { countWords } from "../src/engine/text.js";
import { riskTierFor } from "../src/scoring/risk.js";
import { creatureFor, creatureSvg, pointsFor, stakeTag, wordCount } from "../src/web/public/creature.js";
import { revealBeats, type PublicResults } from "../src/web/public/table.js";

const stakes = { riskTiers: defaultTunables.riskTiers, deceptionBase: defaultTunables.scoring.deceptionBase };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const anyText = fc.oneof(fc.string(), fc.string({ unit: "grapheme" }), fc.array(fc.constantFrom("a", " ", "\n", "\t", "é", "🍲", "<b>"), { maxLength: 120 }).map(a => a.join("")));

describe("creature (stakes under the cloche)", () => {
  it("counts words exactly as the server does", () => {
    fc.assert(fc.property(anyText, text => { expect(wordCount(text)).toBe(countWords(text)); }));
  });

  it("depends only on the text: deterministic and never throws", () => {
    fc.assert(fc.property(anyText, text => {
      const a = creatureFor(text, stakes);
      expect(creatureFor(text, stakes)).toEqual(a);
      expect(creatureSvg(a)).toBe(creatureSvg(creatureFor(text, stakes)));
    }));
  });

  it("maps length tiers to species and the most the dish could earn", () => {
    const at = (n: number) => { const c = creatureFor(words(n), stakes); return [c.kind, c.tier, c.maxPoints]; };
    expect(at(0)).toEqual(["blank", null, 0]);
    expect(at(1)).toEqual(["safe", "SAFE", 100]);
    expect(at(15)).toEqual(["safe", "SAFE", 100]);
    expect(at(16)).toEqual(["bold", "BOLD", 125]);
    expect(at(35)).toEqual(["bold", "BOLD", 125]);
    expect(at(36)).toEqual(["dangerous", "DANGEROUS", 160]);
    expect(at(70)).toEqual(["dangerous", "DANGEROUS", 160]);
    expect(stakeTag(creatureFor(words(20), stakes))).toBe("BOLD · up to 125");
  });

  it("shrinks to exactly the server's deception points for any ballot split", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 70 }), fc.integer({ min: 1, max: 5 }), fc.nat(), (n, of, f) => {
      const found = f % (of + 1);
      const tier = riskTierFor(n, defaultTunables.riskTiers)!;
      const server = Math.round(defaultTunables.scoring.deceptionBase * ((of - found) / of) * tier.multiplier);
      expect(pointsFor(creatureFor(words(n), stakes), found, of)).toBe(server);
    }));
    expect(pointsFor(creatureFor("", stakes), 0, 5)).toBe(0);
    expect(pointsFor(creatureFor("hi", stakes), 0, 0)).toBe(0);
  });

  it("never interpolates answer text into its markup", () => {
    fc.assert(fc.property(anyText, text => {
      const svg = creatureSvg(creatureFor(`${text} <script>alert(1)</script> zebra`, stakes));
      expect(svg).not.toMatch(/script|zebra|alert/);
    }));
  });

  it("varies looks between different answers of the same tier", () => {
    const hues = new Set(Array.from({ length: 12 }, (_, i) => creatureFor(`answer number ${i} here`, stakes).traits.hue));
    expect(hues.size).toBeGreaterThan(6);
  });
});

describe("reveal beats feed the creature", () => {
  it("found beats count up so the last one lands on the round's points", () => {
    const r: PublicResults = {
      humanLabel: "B", blank: false, humanTasteLabel: null,
      table: ["A", "B", "C"].map(label => ({ label, text: label, creatorKind: label === "B" ? "human" : "machine", creatorDisplayName: label === "B" ? "You" : `M${label}` })),
      detectionBallots: [{ judgeDisplayName: "MA", chosenLabel: "B" }, { judgeDisplayName: "MC", chosenLabel: "B" }, { judgeDisplayName: "MD", chosenLabel: "A" }],
      machineTasteBallots: [],
    };
    const found = revealBeats(r).filter(b => b.type === "found");
    expect(found.map(b => [b.found, b.of])).toEqual([[1, 3], [2, 3]]);
    const creature = creatureFor(words(40), stakes);
    expect(pointsFor(creature, 2, 3)).toBe(Math.round(100 * (1 / 3) * 1.6));
  });
});
