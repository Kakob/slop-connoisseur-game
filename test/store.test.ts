import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GameStore } from "../src/store/store.js";
import type { Specimen } from "../src/domain/types.js";

function specimen(id: string): Specimen {
  return {
    id,
    text: "hello",
    creatorType: "human",
    creatorContestantId: "c1",
    promptId: "p1",
    createdAt: "2026-08-20T00:00:00.000Z",
    wordCount: 1,
    isBlank: false,
    reuseAllowed: true,
  };
}

const tmpDirs: string[] = [];
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-store-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("GameStore", () => {
  it("rejects duplicate ids", () => {
    const store = GameStore.open();
    store.insert("specimen", specimen("s1"));
    expect(() => store.insert("specimen", specimen("s1"))).toThrow(/Duplicate/);
  });

  it("refuses to update immutable kinds (specimens never mutate)", () => {
    const store = GameStore.open();
    store.insert("specimen", specimen("s1"));
    expect(() => store.update("specimen", { ...specimen("s1"), text: "edited" })).toThrow(
      /immutable/,
    );
  });

  it("allows round phase updates", () => {
    const store = GameStore.open();
    store.insert("round", {
      id: "r1",
      mode: "hide-from-machines",
      promptId: "p1",
      phase: "READY",
      humanContestantId: "h1",
      machineContestantIds: [],
      timings: {},
      createdAt: "2026-08-20T00:00:00.000Z",
    });
    store.update("round", { ...store.get("round", "r1"), phase: "WRITING" });
    expect(store.get("round", "r1").phase).toBe("WRITING");
  });

  it("fails loudly on missing records", () => {
    const store = GameStore.open();
    expect(() => store.get("specimen", "nope")).toThrow(/Missing specimen/);
  });

  it("persists and reloads records from JSONL, keeping the latest round state", () => {
    const dir = tmpDir();
    const store = GameStore.open(dir);
    store.insert("specimen", specimen("s1"));
    store.insert("round", {
      id: "r1",
      mode: "hide-from-machines",
      promptId: "p1",
      phase: "READY",
      humanContestantId: "h1",
      machineContestantIds: [],
      timings: {},
      createdAt: "2026-08-20T00:00:00.000Z",
    });
    store.update("round", { ...store.get("round", "r1"), phase: "RESULTS" });

    const reloaded = GameStore.open(dir);
    expect(reloaded.get("specimen", "s1").text).toBe("hello");
    expect(reloaded.get("round", "r1").phase).toBe("RESULTS");
    expect(reloaded.all("round")).toHaveLength(1);
  });

  it("fails loudly on malformed stored records", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "specimen.jsonl"), "not json\n");
    expect(() => GameStore.open(dir)).toThrow(/Malformed record/);
  });
});
