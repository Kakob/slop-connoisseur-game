import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { FRIEND, YOU, ownLabelFor, revealBeats, seatGuests, tableModel, type PublicResults } from "../src/web/public/table.js";

const NAMES = ["The Minimalist", "The Anecdotalist", "The Messy Thinker", "The Comedian", "The Earnest One"];

function results(over: Partial<PublicResults> = {}): PublicResults {
  return {
    humanLabel: "C",
    blank: false,
    humanTasteLabel: "A",
    table: ["A", "B", "C", "D", "E", "F"].map((label, i) => ({
      label, text: `answer ${label}`,
      creatorKind: label === "C" ? "human" : "machine",
      creatorDisplayName: label === "C" ? "Your friend" : NAMES[i > 2 ? i - 1 : i]!,
    })),
    detectionBallots: [
      { judgeDisplayName: NAMES[0]!, chosenLabel: "C" },
      { judgeDisplayName: NAMES[1]!, chosenLabel: "A" },
      { judgeDisplayName: NAMES[2]!, chosenLabel: "F" },
      { judgeDisplayName: NAMES[3]!, chosenLabel: "C" },
      { judgeDisplayName: NAMES[4]!, chosenLabel: "B" },
    ],
    machineTasteBallots: NAMES.map((n, i) => ({ judgeDisplayName: n, chosenLabel: i % 2 ? "C" : "D" })),
    ...over,
  };
}
const of = (beats: ReturnType<typeof revealBeats>, type: string) => beats.filter(b => b.type === type);

describe("tableModel (pre-reveal boundary)", () => {
  it("copies only label and text, even when candidates carry provenance", () => {
    const leaky = [
      { label: "B", text: "two", creatorKind: "human", persona: "comedian", creatorDisplayName: "Secret" },
      { label: "A", text: "one", judgeDisplayName: "x" },
    ];
    const plates = tableModel(leaky);
    expect(plates.map(p => p.label)).toEqual(["A", "B"]);
    for (const p of plates) expect(Object.keys(p).sort()).toEqual(["label", "own", "text"]);
    expect(JSON.stringify(plates)).not.toMatch(/human|comedian|Secret/);
  });

  it("adds the creator's own plate in label order", () => {
    const candidates = ["A", "B", "D", "E", "F"].map(label => ({ label, text: label }));
    expect(ownLabelFor(candidates)).toBe("C");
    const plates = tableModel(candidates, { ownLabel: "C", ownText: "mine" });
    expect(plates.map(p => p.label).join("")).toBe("ABCDEF");
    expect(plates.find(p => p.own)).toEqual({ label: "C", text: "mine", own: true });
  });
});

describe("seatGuests", () => {
  it("seats machine writers alphabetically and never the human", () => {
    const guests = seatGuests(results());
    expect(guests.map(g => g.name)).toEqual([...NAMES].sort((a, b) => a.localeCompare(b)));
    expect(new Set(guests.map(g => g.color)).size).toBe(guests.length);
    expect(guests.some(g => g.name === "Your friend")).toBe(false);
  });
});

describe("revealBeats", () => {
  it("orders unmask → suspects → lift → found → fooled → favorites → summary", () => {
    const beats = revealBeats(results());
    const types = beats.map(b => b.type);
    expect(types[0]).toBe("unmask");
    expect(types.at(-1)).toBe("summary");
    const lift = types.indexOf("lift");
    expect(types.lastIndexOf("suspect")).toBeLessThan(lift);
    expect(types.indexOf("found")).toBeGreaterThan(lift);
    expect(types.lastIndexOf("found")).toBeLessThan(types.indexOf("fooled"));
    expect(types.lastIndexOf("fooled")).toBeLessThan(types.indexOf("favorite"));
    expect(of(beats, "suspect").map(b => b.who)).toEqual(NAMES);
  });

  it("fooled beats fill the meter to the missed-ballot count", () => {
    const beats = revealBeats(results());
    const fooled = of(beats, "fooled");
    expect(fooled).toHaveLength(3);
    expect(fooled.map(b => b.fooled)).toEqual([1, 2, 3]);
    expect(of(beats, "found")).toHaveLength(2);
    expect(beats.at(-1)).toMatchObject({ fooled: 3, of: 5, tasteForHuman: 2, tasteJudges: 5 });
  });

  it("counts favorites from AI ballots plus creator and recipient favorites", () => {
    expect(of(revealBeats(results()), "favorite")).toHaveLength(6);
    const recipient = revealBeats(results(), { viewer: "recipient", choices: { detection: "C", taste: "E" } });
    const favs = of(recipient, "favorite");
    expect(favs).toHaveLength(7);
    expect(favs.at(-2)).toMatchObject({ who: FRIEND, label: "A" });
    expect(favs.at(-1)).toMatchObject({ who: YOU, label: "E" });
  });

  it("puts the recipient's pick first and judges it at the lift", () => {
    const beats = revealBeats(results(), { viewer: "recipient", choices: { detection: "F" } });
    expect(of(beats, "suspect")[0]).toMatchObject({ who: YOU, label: "F" });
    const verdict = beats[beats.findIndex(b => b.type === "lift") + 1];
    expect(verdict).toMatchObject({ type: "verdict", found: false });
    expect(of(beats, "fooled")).toHaveLength(3); // the recipient is not an AI judge
  });

  it("treats missing ballots as abstentions, never found or fooled", () => {
    const r = results({ detectionBallots: results().detectionBallots.slice(0, 3), machineTasteBallots: [] });
    const beats = revealBeats(r);
    const abstain = of(beats, "abstain");
    expect(abstain.filter(b => b.vote === "detection").map(b => b.who).sort()).toEqual([NAMES[3], NAMES[4]].sort());
    expect(abstain.filter(b => b.vote === "taste")).toHaveLength(5);
    expect(of(beats, "found").length + of(beats, "fooled").length).toBe(3);
    expect(beats.at(-1)).toMatchObject({ of: 3, tasteJudges: 0 });
  });

  it("lifts a blank as an empty plate", () => {
    const lift = of(revealBeats(results({ blank: true })), "lift")[0];
    expect(lift).toMatchObject({ blank: true, label: "C" });
    expect(lift!.text).toMatch(/empty plate/);
  });

  it("property: fooled beats equal ballots that missed the human label", () => {
    const label = fc.constantFrom("A", "B", "C", "D", "E", "F");
    fc.assert(fc.property(
      label, fc.array(fc.record({ judgeDisplayName: fc.constantFrom(...NAMES), chosenLabel: label }), { maxLength: 5 }),
      (humanLabel, detectionBallots) => {
        const beats = revealBeats(results({ humanLabel, detectionBallots }));
        const missed = detectionBallots.filter(b => b.chosenLabel !== humanLabel).length;
        expect(of(beats, "fooled")).toHaveLength(missed);
        expect(of(beats, "found")).toHaveLength(detectionBallots.length - missed);
        expect(beats.at(-1)).toMatchObject({ type: "summary", fooled: missed, of: detectionBallots.length });
      },
    ));
  });
});
