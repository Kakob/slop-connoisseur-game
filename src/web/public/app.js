/* Slop Connoisseur client (vanilla JS, SPEC §29). The server is authoritative
   for all hidden state; this file only renders and relays. */

const $ = (id) => document.getElementById(id);
const screens = ["start", "writing", "time", "waiting", "taste", "reveal", "error"];

function show(name) {
  for (const s of screens) $(`screen-${s}`).hidden = s !== name;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function countWords(text) {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function tierFor(words, tiers) {
  return tiers.find((t) => words >= t.min && words <= t.max) ?? null;
}

// ---------------------------------------------------------------------------
// Writing phase
// ---------------------------------------------------------------------------

let state = null; // { roundId, maxWords, riskTiers, deadline, timer, typingSent, submitted }

function renderWordStatus() {
  const words = countWords($("response").value);
  const tier = tierFor(words, state.riskTiers);
  $("word-status").innerHTML = tier
    ? `${words} word${words === 1 ? "" : "s"}\n<span class="tier">${tier.name}</span> · ×${tier.multiplier}`
    : `${words} words`;
}

function renderCountdown() {
  const remaining = Math.max(0, state.deadline - Date.now());
  const total = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  const el = $("countdown");
  el.textContent = `${mm}:${ss}`;
  el.classList.toggle("urgent", total <= 10);
  if (remaining <= 0) submitNow(true);
}

async function startRound() {
  show("waiting");
  $("waiting-msg").textContent = "Setting the table...";
  try {
    const round = await api("/api/round");
    state = {
      roundId: round.roundId,
      maxWords: round.maxWords,
      riskTiers: round.riskTiers,
      deadline: Date.now() + round.seconds * 1000,
      typingSent: false,
      submitted: false,
      previousText: "",
    };
    $("writing-prompt").textContent = round.promptText;
    $("response").value = "";
    show("writing");
    $("response").focus();
    renderWordStatus();
    renderCountdown();
    state.timer = setInterval(renderCountdown, 200);
  } catch (error) {
    showError(error);
  }
}

function onInput() {
  const el = $("response");
  // Hard 70-word cap (§5): reject edits that add words beyond the cap.
  if (countWords(el.value) > state.maxWords) {
    el.value = state.previousText;
  } else {
    state.previousText = el.value;
  }
  if (!state.typingSent && el.value.length > 0) {
    state.typingSent = true;
    api(`/api/round/${state.roundId}/typing`).catch(() => {});
  }
  renderWordStatus();
}

async function submitNow(fromTimer) {
  if (!state || state.submitted) return;
  const text = $("response").value.trim();
  if (!fromTimer && text.length === 0) return; // only the timer may create a blank (§5)
  state.submitted = true;
  clearInterval(state.timer);

  if (fromTimer && text.length === 0) {
    show("time"); // TIME. No response submitted. (§29)
    await sleep(1600);
  }
  show("waiting");
  $("waiting-msg").textContent = "The machines are writing...";
  try {
    const result = await api(`/api/round/${state.roundId}/submit`, { text: text || null });
    renderTaste(result.candidates);
  } catch (error) {
    showError(error);
  }
}

// ---------------------------------------------------------------------------
// Taste vote
// ---------------------------------------------------------------------------

function renderTaste(candidates) {
  $("taste-prompt").textContent = $("writing-prompt").textContent;
  const box = $("taste-candidates");
  box.innerHTML = "";
  for (const c of candidates) {
    const btn = document.createElement("button");
    btn.className = "candidate";
    btn.innerHTML = `<span class="label">${c.label}.</span>${escapeHtml(c.text)}`;
    btn.addEventListener("click", () => castTaste(c.label), { once: true });
    box.appendChild(btn);
  }
  show("taste");
}

async function castTaste(label) {
  show("waiting");
  $("waiting-msg").textContent = "THE MACHINES ARE LOOKING FOR YOU...";
  try {
    const results = await api(`/api/round/${state.roundId}/taste`, { label });
    await renderReveal(results);
  } catch (error) {
    showError(error);
  }
}

// ---------------------------------------------------------------------------
// Reveal (§29: progressive)
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function line(html, className) {
  const p = document.createElement("p");
  if (className) p.className = className;
  p.innerHTML = html;
  $("reveal-content").appendChild(p);
}

async function renderReveal(r) {
  $("reveal-content").innerHTML = "";
  $("next-btn").hidden = true;
  show("reveal");

  line("THE MACHINES HAVE VOTED.", "big");
  await sleep(700);
  for (const b of r.detectionBallots) {
    line(`${escapeHtml(b.judgeDisplayName)} → ${b.chosenLabel}`, "ballot");
    await sleep(500);
  }
  await sleep(400);
  line(`YOU WERE ${r.humanLabel}.`, "big");
  await sleep(800);
  line(`${r.machinesFound} MACHINE${r.machinesFound === 1 ? "" : "S"} FOUND YOU.`);
  line(`${r.machinesFooled} LET YOU THROUGH.`);
  await sleep(1000);

  line("TASTE", "big");
  await sleep(500);
  for (const b of r.machineTasteBallots) {
    const crown = b.chosenLabel === r.humanLabel ? ' <span class="crown">👑</span>' : "";
    line(`${escapeHtml(b.judgeDisplayName)} → ${b.chosenLabel}${crown}`, "ballot");
    await sleep(500);
  }
  line(`${r.machineTasteVotesForHuman}/${r.machineTasteBallots.length} machines chose you.`);
  if (r.humanTasteLabel) line(`Your pick → ${r.humanTasteLabel}`, "dim");
  await sleep(1000);

  if (r.blank) {
    line("NO RESPONSE", "big");
    line('<span class="scoreline"><span>DECEPTION</span><span>0%</span></span>');
    line('<span class="scoreline"><span>TASTE</span><span>0%</span></span>');
    line('<span class="scoreline"><span>RISK</span><span>—</span></span>');
    line("The round still counts.", "dim");
  } else {
    const pct = (x) => `${Math.round(x * 100)}%`;
    line(`<span class="scoreline"><span>DECEPTION</span><span>${pct(r.deceptionRate)}</span></span>`, "big");
    line(`<span class="scoreline"><span>TASTE</span><span>${pct(r.tasteRate)}</span></span>`);
    line(
      `<span class="scoreline"><span>RISK</span><span>${r.riskTier ? `${r.riskTier.name} ×${r.riskTier.multiplier}` : "—"}</span></span>`,
    );
    line(`<span class="scoreline"><span>SCORE</span><span>${r.deceptionPoints}</span></span>`);
    for (const d of r.distinctions) {
      line(`★ ${d.replaceAll("_", " ")}`, "distinction");
    }
  }

  $("reveal-content").appendChild(document.createElement("hr")).className = "rule";
  line("THE TABLE", "dim");
  for (const row of r.table) {
    const you = row.creatorKind === "human";
    line(
      `${row.label}. <span class="who${you ? " you" : ""}">${you ? "YOU" : escapeHtml(row.creatorDisplayName)}</span> — ${escapeHtml(row.text)}`,
      "table-row",
    );
  }
  $("next-btn").hidden = false;
}

// ---------------------------------------------------------------------------
// Errors and wiring
// ---------------------------------------------------------------------------

function showError(error) {
  $("error-msg").textContent = String(error.message ?? error);
  show("error");
}

$("start-btn").addEventListener("click", startRound);
$("retry-btn").addEventListener("click", startRound);
$("next-btn").addEventListener("click", startRound);
$("submit-btn").addEventListener("click", () => submitNow(false));
$("response").addEventListener("input", onInput);
show("start");
