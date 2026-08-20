/* Slop Studio client: author/curate prompts, run machine generations. Plain and ugly on purpose. */

const $status = document.getElementById("status");
const $prompts = document.getElementById("prompts");
const $runs = document.getElementById("runs");
const $editor = document.getElementById("editor");
const $editorId = document.getElementById("editor-id");
const $editorText = document.getElementById("editor-text");

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
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
      el("tr", className ? { class: className } : {},
        cells.map((c) => (c instanceof Node ? el("td", {}, [c]) : el("td", { text: String(c) })))),
    );
  }
  return t;
}

async function api(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function status(text) {
  $status.textContent = text;
}

async function withStatus(runningText, fn) {
  status(runningText);
  try {
    await fn();
    status("");
  } catch (error) {
    status(`ERROR: ${error.message}`);
  }
}

let editingPromptId = null;

function openEditor(prompt) {
  editingPromptId = prompt.id;
  $editorId.textContent = prompt.id;
  $editorText.value = prompt.text;
  $editor.hidden = false;
  $editor.scrollIntoView({ behavior: "smooth" });
}

function closeEditor() {
  editingPromptId = null;
  $editor.hidden = true;
}

async function loadPrompts() {
  const prompts = await api("/api/studio/prompts", "GET");
  $prompts.innerHTML = "";
  $prompts.appendChild(el("h3", { text: `PROMPTS (${prompts.length})` }));
  $prompts.appendChild(
    table(
      ["text", "source", "active", "played", "lineage", "actions"],
      prompts.map((p) => {
        const actions = el("span", {}, [
          button(p.active ? "deactivate" : "activate", () =>
            withStatus("Updating...", async () => {
              await api(`/api/studio/prompt/${p.id}/active`, "POST", { active: !p.active });
              await loadPrompts();
            }),
          ),
          button("edit", () => openEditor(p)),
          button("generate (5 model calls)", () =>
            withStatus("Generating — 5 live model calls, this can take a minute...", async () => {
              await api("/api/studio/generate", "POST", { promptId: p.id });
              await loadRuns();
            }),
          ),
        ]);
        return {
          className: p.active ? "" : "inactive-row",
          cells: [p.text, p.source, p.active, p.playedRoundCount, p.parentPromptId ?? "—", actions],
        };
      }),
    ),
  );
}

function button(label, onClick) {
  const b = el("button", { class: "row-btn", text: label });
  b.addEventListener("click", onClick);
  return b;
}

async function loadRuns() {
  const runs = await api("/api/studio/runs", "GET");
  $runs.innerHTML = "";
  $runs.appendChild(el("h3", { text: `STUDIO RUNS (${runs.length})` }));
  if (runs.length === 0) {
    $runs.appendChild(el("p", { class: "dim", text: "No generation runs yet." }));
    return;
  }
  const prompts = await api("/api/studio/prompts", "GET");
  const promptText = Object.fromEntries(prompts.map((p) => [p.id, p.text]));
  for (const { run, specimens } of runs) {
    const box = el("div", { class: "run" });
    box.appendChild(el("p", { text: `${run.createdAt} · ${run.provider}/${run.model}` }));
    box.appendChild(el("p", { class: "bold", text: promptText[run.promptId] ?? run.promptId }));
    for (const s of specimens) {
      const m = s.modelMetadata;
      box.appendChild(
        el("div", { class: "specimen" }, [
          el("p", { class: "dim", text: `${m.personaId} v${m.personaVersion} · ${s.wordCount} words · ${m.latencyMs ?? "?"} ms` }),
          el("p", { text: s.text }),
        ]),
      );
    }
    $runs.appendChild(box);
  }
}

document.getElementById("new-prompt-save").addEventListener("click", () =>
  withStatus("Saving...", async () => {
    const text = document.getElementById("new-prompt-text").value;
    await api("/api/studio/prompts", "POST", { text });
    document.getElementById("new-prompt-text").value = "";
    await loadPrompts();
  }),
);

document.getElementById("editor-save").addEventListener("click", () =>
  withStatus("Saving new version...", async () => {
    await api(`/api/studio/prompt/${editingPromptId}/edit`, "POST", { text: $editorText.value });
    closeEditor();
    await loadPrompts();
  }),
);

document.getElementById("editor-cancel").addEventListener("click", closeEditor);

loadPrompts();
loadRuns();
