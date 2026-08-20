/* Slop Lab client (SPEC §28): plain tables + raw JSON. Intentionally ugly. */

const $list = document.getElementById("round-list");
const $detail = document.getElementById("round-detail");

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function table(headers, rows) {
  const t = el("table", { class: "lab" });
  t.appendChild(el("tr", {}, headers.map((h) => el("th", { text: h }))));
  for (const { cells, className } of rows) {
    t.appendChild(
      el("tr", className ? { class: className } : {}, cells.map((c) => el("td", { text: String(c) }))),
    );
  }
  return t;
}

async function loadList() {
  const rounds = await (await fetch("/api/lab/rounds")).json();
  $list.innerHTML = "";
  $list.appendChild(el("h3", { text: `ROUNDS (${rounds.length})` }));
  for (const r of rounds) {
    const btn = el("button", {
      class: "round-link",
      text: `${r.createdAt}  [${r.phase}]  ${r.promptText}  —  ${r.id}`,
    });
    btn.addEventListener("click", () => loadRound(r.id));
    $list.appendChild(btn);
  }
  if (rounds.length === 0) $list.appendChild(el("p", { class: "dim", text: "No rounds played yet." }));
}

async function loadRound(id) {
  const r = await (await fetch(`/api/lab/round/${id}`)).json();
  $detail.innerHTML = "";

  $detail.appendChild(el("h3", { text: `ROUND ${r.round.id}` }));
  $detail.appendChild(
    el("p", {
      class: "dim",
      text: `phase ${r.round.phase} · mode ${r.round.mode} · created ${r.round.createdAt}`,
    }),
  );

  $detail.appendChild(el("h3", { text: "PROMPT" }));
  $detail.appendChild(
    table(
      ["id", "text", "source", "tags", "hypotheses", "active"],
      [{ cells: [r.prompt.id, r.prompt.text, r.prompt.source, r.prompt.tags.join(", "), r.prompt.hypotheses.join(", "), r.prompt.active] }],
    ),
  );

  $detail.appendChild(el("h3", { text: "TABLE (true provenance + anonymous ordering)" }));
  $detail.appendChild(
    table(
      ["label", "creator", "kind", "persona", "words", "blank", "taste-eligible", "specimenId", "model", "strategy", "latency ms", "text"],
      r.table.map((row) => ({
        className: row.creator.kind === "human" ? "human-row" : "",
        cells: [
          row.label,
          row.creator.displayName,
          row.creator.kind,
          row.creator.personaId ? `${row.creator.personaId} v${row.creator.personaVersion}` : "—",
          row.wordCount,
          row.isBlank,
          row.eligibleForTaste,
          row.specimenId,
          row.modelMetadata ? `${row.modelMetadata.provider}/${row.modelMetadata.model}` : "—",
          row.modelMetadata ? `${row.modelMetadata.strategyId} v${row.modelMetadata.strategyVersion}` : "—",
          row.modelMetadata?.latencyMs ?? "—",
          row.text,
        ],
      })),
    ),
  );

  $detail.appendChild(el("h3", { text: "DETECTION JUDGMENTS (raw)" }));
  $detail.appendChild(judgmentTable(r.detectionJudgments));
  $detail.appendChild(el("h3", { text: "TASTE JUDGMENTS (raw)" }));
  $detail.appendChild(judgmentTable(r.tasteJudgments));

  if (r.failedJudgments.length > 0) {
    $detail.appendChild(el("h3", { text: "FAILED JUDGMENTS" }));
    $detail.appendChild(
      table(
        ["judge", "type", "error", "at"],
        r.failedJudgments.map((f) => ({ cells: [f.judgeContestantId, f.type, f.error, f.createdAt] })),
      ),
    );
  }

  if (r.retriesAndErrors.length > 0) {
    $detail.appendChild(el("h3", { text: "RETRIES / ERRORS" }));
    $detail.appendChild(
      table(
        ["at", "type", "data"],
        r.retriesAndErrors.map((e) => ({ cells: [e.at, e.type, JSON.stringify(e.data)] })),
      ),
    );
  }

  $detail.appendChild(el("h3", { text: "COMPUTED RESULTS" }));
  $detail.appendChild(el("pre", { text: JSON.stringify(r.results, null, 2) }));

  $detail.appendChild(el("h3", { text: `EVENTS (${r.events.length})` }));
  $detail.appendChild(
    table(
      ["at", "type", "data"],
      r.events.map((e) => ({ cells: [e.at, e.type, JSON.stringify(e.data)] })),
    ),
  );

  $detail.scrollIntoView({ behavior: "smooth" });
}

function judgmentTable(judgments) {
  return table(
    ["judge", "type", "chose", "appearanceId", "judge metadata", "at"],
    judgments.map((j) => ({
      cells: [
        j.judgeContestantId,
        j.type,
        j.chosenLabel,
        j.chosenAppearanceId,
        j.judgeMetadata ? JSON.stringify(j.judgeMetadata) : "—",
        j.createdAt,
      ],
    })),
  );
}

loadList();
