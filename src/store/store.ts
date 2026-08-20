/**
 * Append-only game store (SPEC §32): one JSONL file per entity kind, plus an
 * in-memory index. Specimens, appearances, judgments, and events are
 * insert-only; only round records (phase/timing progression) may be updated.
 * Malformed stored records fail loudly at load, never silently skip.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Appearance,
  Contestant,
  FailedJudgment,
  GameEvent,
  GamePrompt,
  Judgment,
  PromptDerivation,
  Round,
  Specimen,
  SpecimenDerivation,
} from "../domain/types.js";

export type EntityKind =
  | "prompt"
  | "promptDerivation"
  | "contestant"
  | "round"
  | "specimen"
  | "specimenDerivation"
  | "appearance"
  | "judgment"
  | "failedJudgment"
  | "event";

type KindMap = {
  prompt: GamePrompt;
  promptDerivation: PromptDerivation;
  contestant: Contestant;
  round: Round;
  specimen: Specimen;
  specimenDerivation: SpecimenDerivation;
  appearance: Appearance;
  judgment: Judgment;
  failedJudgment: FailedJudgment;
  event: GameEvent;
};

const ALL_KINDS: EntityKind[] = [
  "prompt",
  "promptDerivation",
  "contestant",
  "round",
  "specimen",
  "specimenDerivation",
  "appearance",
  "judgment",
  "failedJudgment",
  "event",
];

/** The only kind whose records may be re-written (round phase/timing progression). */
const MUTABLE_KINDS: EntityKind[] = ["round"];

export class GameStore {
  private readonly tables = new Map<EntityKind, Map<string, unknown>>();

  private constructor(private readonly persistDir?: string) {
    for (const kind of ALL_KINDS) this.tables.set(kind, new Map());
  }

  /** Creates an in-memory store (tests) or a disk-backed store (play). */
  static open(persistDir?: string): GameStore {
    const store = new GameStore(persistDir);
    if (persistDir) {
      fs.mkdirSync(persistDir, { recursive: true });
      for (const kind of ALL_KINDS) {
        const file = store.fileFor(kind);
        if (!fs.existsSync(file)) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim().length > 0);
        for (const [lineNo, line] of lines.entries()) {
          let record: { id?: unknown };
          try {
            record = JSON.parse(line);
          } catch {
            throw new Error(`Malformed record in ${file}:${lineNo + 1}`);
          }
          if (typeof record.id !== "string" || record.id.length === 0) {
            throw new Error(`Record without id in ${file}:${lineNo + 1}`);
          }
          // Later lines for the same id are updates (mutable kinds re-append).
          store.table(kind).set(record.id, record);
        }
      }
    }
    return store;
  }

  private table(kind: EntityKind): Map<string, unknown> {
    return this.tables.get(kind)!;
  }

  private fileFor(kind: EntityKind): string {
    return path.join(this.persistDir!, `${kind}.jsonl`);
  }

  private append(kind: EntityKind, record: { id: string }): void {
    if (this.persistDir) {
      fs.appendFileSync(this.fileFor(kind), JSON.stringify(record) + "\n");
    }
  }

  /** Inserts a new immutable record; duplicate ids fail loudly. */
  insert<K extends EntityKind>(kind: K, record: KindMap[K]): KindMap[K] {
    const table = this.table(kind);
    if (table.has(record.id)) {
      throw new Error(`Duplicate ${kind} id: ${record.id}`);
    }
    table.set(record.id, record);
    this.append(kind, record);
    return record;
  }

  /** Re-writes an existing record; only permitted for mutable kinds (rounds). */
  update<K extends EntityKind>(kind: K, record: KindMap[K]): KindMap[K] {
    if (!MUTABLE_KINDS.includes(kind)) {
      throw new Error(`${kind} records are immutable and cannot be updated`);
    }
    const table = this.table(kind);
    if (!table.has(record.id)) {
      throw new Error(`Cannot update missing ${kind} id: ${record.id}`);
    }
    table.set(record.id, record);
    this.append(kind, record);
    return record;
  }

  /** Fetches one record, failing loudly when absent. */
  get<K extends EntityKind>(kind: K, id: string): KindMap[K] {
    const record = this.table(kind).get(id);
    if (!record) throw new Error(`Missing ${kind} id: ${id}`);
    return record as KindMap[K];
  }

  /** Returns whether a record exists. */
  has(kind: EntityKind, id: string): boolean {
    return this.table(kind).has(id);
  }

  /** Returns all records of a kind in insertion order. */
  all<K extends EntityKind>(kind: K): KindMap[K][] {
    return [...this.table(kind).values()] as KindMap[K][];
  }

  /** Returns all records of a kind matching a predicate. */
  where<K extends EntityKind>(kind: K, predicate: (r: KindMap[K]) => boolean): KindMap[K][] {
    return this.all(kind).filter(predicate);
  }
}
