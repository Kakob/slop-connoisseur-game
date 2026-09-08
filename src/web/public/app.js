/* The server owns game state; the browser keeps only a writing draft. */
const $ = id => document.getElementById(id);
let state = null;
let challenge = null;
let creatorResults = null;
let shareId = null;
let sourceChallengeId = null;
let busy = false;
let pollTimer;
const pathMatch = location.pathname.match(/^\/(challenge|results)\/([^/]+)$/);
function show(name) {
  document.body.dataset.screen = name;
  const progress = $('round-progress');
  progress.hidden = ['start', 'owner', 'error'].includes(name);
  const recipient = !!challenge && !challenge.preview;
  const labels = recipient ? ['Read', 'Guess', 'Reveal'] : ['Write', 'Taste', 'Reveal'];
  const current = name === 'reveal' || name === 'ready' ? 2 : name === 'taste' || name === 'challenge' ? 1 : 0;
  progress.replaceChildren(...labels.map((label, i) => {
    const step = element('li', `0${i + 1} / ${label}`);
    if (i === current) step.setAttribute('aria-current', 'step');
    return step;
  }));
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== `screen-${name}`;
  const heading = document.querySelector(`#screen-${name} h1`);
  if (heading) { heading.tabIndex = -1; heading.focus(); }
  window.scrollTo(0, 0);
}
function element(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}
function showError(error) {
  clearTimeout(pollTimer);
  if (state) clearInterval(state.timer);
  busy = false; $('error-msg').textContent = error.message; show('error');
}
function remember(key, value) { try { localStorage.setItem(key, value); } catch {} }
function recalled(key) { try { return localStorage.getItem(key); } catch { return null; } }
function wordCount(text) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
function card(label, text) {
  const article = element('article', '', 'answer');
  article.append(element('h2', `Answer ${label}`, 'answer-label'), element('p', text, 'answer-text'));
  return article;
}
function wordStatus() {
  const n = wordCount($('response').value);
  const tier = state.riskTiers.find(t => n >= t.min && n <= t.max);
  $('word-status').textContent = `${n} / ${state.maxWords} words${tier ? ` · ${tier.name} ×${tier.multiplier}` : ''}`;
}
function tick() {
  const left = Math.max(0, state.deadline - Date.now());
  $('countdown').textContent = `00:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
  if (!left) submit();
}
function writing(round) {
  if (state) clearInterval(state.timer);
  state = { ...round, deadline: Date.now() + Math.max(0, round.deadline - round.serverNow), submitted: false };
  remember('slop-round', state.roundId);
  $('writing-prompt').textContent = round.promptText;
  $('response').value = recalled(`draft-${round.roundId}`) || '';
  state.previousText = $('response').value;
  show('writing'); wordStatus();
  state.timer = setInterval(tick, 200); tick(); $('response').focus();
}
async function startRound() {
  if (busy) return;
  busy = true; clearTimeout(pollTimer);
  if (state) clearInterval(state.timer);
  show('waiting'); $('waiting-msg').textContent = 'The machines are starting their answers…';
  try {
    let requestId = recalled('slop-pending-start');
    if (!requestId) { requestId = crypto.randomUUID(); remember('slop-pending-start', requestId); }
    const round = await api('/api/round', { requestId, ...(sourceChallengeId ? { sourceChallengeId } : {}) });
    remember('slop-pending-start', '');
    challenge = null; creatorResults = null; shareId = null;
    busy = false;
    history.replaceState(null, '', '/');
    if (round.resumed) return resumeRound(round.roundId);
    writing(round);
  } catch (error) { showError(error); }
}
async function submit() {
  if (!state || state.submitted) return;
  state.submitted = true; clearInterval(state.timer);
  show('waiting'); $('waiting-msg').textContent = 'Your answer is locked. Waiting for the machines…';
  try {
    const result = await api(`/api/round/${state.roundId}/submit`, { text: $('response').value.trim() || null });
    renderTaste(result.candidates);
  } catch (error) { showError(error); }
}
function renderTaste(candidates) {
  $('taste-prompt').textContent = state.promptText;
  $('taste-candidates').replaceChildren();
  for (const c of candidates) {
    const button = element('button', `${c.label}. ${c.text}`, 'candidate');
    button.onclick = () => castTaste(c.label); $('taste-candidates').append(button);
  }
  show('taste');
}
async function castTaste(label) {
  if (busy) return; busy = true;
  show('waiting'); $('waiting-msg').textContent = 'The machines are looking for you…';
  try { ready(await api(`/api/round/${state.roundId}/taste`, { label })); busy = false; }
  catch (error) { showError(error); }
}
function ready(results) {
  creatorResults = results;
  $('ready-prompt').textContent = results.promptText;
  $('ready-table').replaceChildren(...results.table.map(r => card(r.label, r.text)));
  show('ready');
}
async function resumeRound(id = state?.roundId || recalled('slop-round')) {
  if (!id) return home();
  try {
    const round = await api(`/api/round/${id}`); state = { ...state, ...round };
    if (round.failure) throw new Error(round.failure);
    if (round.results) return ready(round.results);
    if (round.phase === 'WRITING') return writing(round);
    if (round.candidates) {
      if (round.selectedTaste) return castTaste(round.selectedTaste);
      return renderTaste(round.candidates);
    }
    show('waiting'); $('waiting-msg').textContent = 'Your round is still being prepared…';
    pollTimer = setTimeout(() => resumeRound(id), 1500);
  } catch (error) { showError(error); }
}
function renderChallenge(data) {
  challenge = data; shareId = data.challengeId; sourceChallengeId = data.challengeId;
  if (data.results) return renderResults(data.results, data.choices, false);
  $('challenge-prompt').textContent = data.promptText;
  $('preview-note').hidden = !data.preview;
  const locked = data.state !== 'choosing' || data.preview;
  $('challenge-candidates').replaceChildren();
  for (const c of data.candidates) {
    const article = card(c.label, c.text);
    for (const [name, text] of [['detection', 'My friend wrote this'], ['taste', 'My favorite']]) {
      const label = element('label', '', 'choice');
      const input = document.createElement('input'); input.type = 'radio'; input.name = name; input.value = c.label;
      input.setAttribute('aria-label', `${text}: answer ${c.label}`);
      if (name === 'detection') input.required = !locked;
      input.disabled = locked;
      input.checked = data.choices?.[name] === c.label;
      label.append(input, document.createTextNode(text)); article.append(label);
    }
    $('challenge-candidates').append(article);
  }
  $('skip-favorite').hidden = locked;
  $('skip-favorite').querySelector('input').checked = !data.choices?.taste;
  $('lock-btn').hidden = locked;
  $('visibility-note').hidden = locked;
  $('locked-note').hidden = !locked || data.preview;
  $('challenge-reveal-btn').hidden = !locked;
  $('guess-instructions').textContent = locked ? 'The original lineup. Reveal whenever you’re ready.' : 'Which answer did your friend write? Choose one guess, and optionally a favorite.';
  show('challenge');
}
async function openChallenge(id) {
  try { renderChallenge(await api(`/api/challenge/${id}`)); }
  catch (error) { showError(error); }
}
function renderResults(r, choices, creator) {
  const box = $('reveal-content'); box.replaceChildren();
  box.append(element('p', r.promptText, 'prompt'));
  const heading = creator ? `You were ${r.humanLabel}.` : choices ? (choices.detection === r.humanLabel ? 'You found your friend.' : `Your friend wrote ${r.humanLabel}. You guessed ${choices.detection}.`) : `Your answer was ${r.humanLabel}.`;
  box.append(element('h1', heading));
  if (r.blank) box.append(element('p', 'No response was submitted. This round earns no Deception or Taste score.', 'notice'));
  box.append(element('p', `${r.machinesFooled} of ${r.machineJudgeCount} AI judges missed the human answer.`));
  box.append(element('p', r.machineTasteBallots.length ? `${r.machineTasteVotesForHuman} of ${r.machineTasteBallots.length} AI Taste judges preferred the human answer.` : 'AI Taste results are unavailable; no Taste ballots succeeded.'));
  if (r.machineJudgeCount < 5 || r.machineTasteBallots.length < 5) box.append(element('p', `Partial judging: ${r.machineJudgeCount}/5 Detection and ${r.machineTasteBallots.length}/5 Taste ballots succeeded.`, 'dim'));
  if (choices) box.append(element('p', choices.taste ? `Your favorite: ${choices.taste}.` : 'You didn’t select a favorite.'));
  for (const row of r.table) {
    const article = card(row.label, row.text);
    article.append(element('p', row.creatorKind === 'human' ? (creator ? 'Written by you' : 'Written by your friend') : `Written by ${row.creatorDisplayName}`, 'identity'));
    const detection = r.detectionBallots.filter(b => b.chosenLabel === row.label).map(b => b.judgeDisplayName);
    const taste = r.machineTasteBallots.filter(b => b.chosenLabel === row.label).map(b => b.judgeDisplayName);
    article.append(element('p', `AI human guesses: ${detection.join(', ') || 'None'}`, 'ballot'));
    article.append(element('p', `AI favorites: ${r.machineTasteBallots.length ? taste.join(', ') || 'None' : 'Unavailable'}`, 'ballot'));
    if (r.humanTasteLabel === row.label) article.append(element('p', creator ? 'Your original favorite' : 'Creator’s original favorite', 'ballot'));
    if (choices?.detection === row.label) article.append(element('p', 'Your guess', 'pick'));
    if (choices?.taste === row.label) article.append(element('p', 'Your favorite', 'pick'));
    box.append(article);
  }
  if (creator) {
    box.append(element('p', `Length-adjusted score: ${r.deceptionPoints}${r.riskTier ? ` · ${r.riskTier.name} ×${r.riskTier.multiplier}` : ''}`, 'dim'));
    for (const distinction of r.distinctions) box.append(element('p', distinction.replaceAll('_', ' '), 'dim'));
  }
  $('owner-link').hidden = !creator;
  if (creator) $('owner-link').href = `/results/${shareId}`;
  $('share-status').textContent = '';
  $('next-invitation').textContent = creator ? 'Make them look twice.' : 'Now make me find you.';
  $('next-btn').textContent = creator ? 'Write another round' : 'Your turn: try hiding yourself';
  show('reveal');
}
async function revealCreator() {
  try {
    const link = await api(`/api/round/${creatorResults.roundId}/challenge`, {});
    shareId = link.challengeId; sourceChallengeId = null; renderResults(creatorResults, null, true);
  } catch (error) { showError(error); }
}
async function share() {
  const url = `${location.origin}/challenge/${shareId}`;
  try {
    // Initiation is observable; delivery is not.
    api(`/api/challenge/${shareId}/share`, {}).catch(() => {});
    if (navigator.share) { await navigator.share({ title: 'Blind Tasting', text: 'One human. Five machines. Find the human.', url }); $('share-status').textContent = 'Share sheet closed.'; }
    else { await navigator.clipboard.writeText(url); $('share-status').textContent = 'Challenge link copied.'; }
  } catch (error) {
    $('share-status').textContent = error.name === 'AbortError' ? 'Sharing canceled.' : 'Copy this challenge link: ';
    if (error.name !== 'AbortError') { const link = element('a', url); link.href = url; $('share-status').append(link); }
  }
}
async function owner(id) {
  try {
    const data = await api(`/api/challenge/${id}/owner`);
    const box = $('owner-results'); box.replaceChildren();
    if (!data.attempts.length) box.append(element('p', 'No completed attempts yet. Share your challenge, then check back here.'));
    data.attempts.forEach((a, i) => box.append(element('p', `Attempt ${i + 1}: guessed ${a.detection}. ${a.correct ? 'They found you.' : `You were ${data.humanLabel}.`} ${a.taste ? `Favorite: ${a.taste}.` : 'No favorite selected.'}`, 'answer')));
    $('preview-link').href = `/challenge/${id}`;
    $('refresh-owner-btn').onclick = () => owner(id); show('owner');
  } catch (error) { showError(error); }
}
async function home() {
  show('start');
  try {
    const me = await api('/api/me');
    const box = $('my-rounds'); box.replaceChildren();
    if (me.challenges.length) box.append(element('h2', 'Your challenges'));
    for (const [i, c] of me.challenges.entries()) { const link = element('a', `Challenge ${i + 1}: see recipient results`, 'history-link'); link.href = c.ownerUrl; box.append(link); }
    if (me.rounds.length) {
      const last = me.rounds.at(-1);
      const button = element('button', last.phase === 'RESULTS' ? 'Return to your last round' : 'Resume your last round', 'secondary');
      button.onclick = () => resumeRound(last.roundId); box.append(button);
    }
  } catch (error) { showError(error); }
}
$('response').oninput = () => {
  if (wordCount($('response').value) > state.maxWords) $('response').value = state.previousText;
  else state.previousText = $('response').value;
  remember(`draft-${state.roundId}`, $('response').value);
  if (!state.typingSent && $('response').value) { state.typingSent = true; api(`/api/round/${state.roundId}/typing`, {}).catch(() => {}); }
  wordStatus();
};
$('guess-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true;
  const form = new FormData(event.currentTarget);
  try { renderChallenge(await api(`/api/challenge/${challenge.challengeId}/lock`, { detection: form.get('detection'), taste: form.get('taste') || null })); busy = false; }
  catch (error) { showError(error); }
};
$('challenge-reveal-btn').onclick = async () => {
  try { renderChallenge(await api(`/api/challenge/${challenge.challengeId}/reveal`, {})); }
  catch (error) { showError(error); }
};
$('creator-reveal-btn').onclick = revealCreator;
$('start-btn').onclick = startRound; $('next-btn').onclick = startRound; $('retry-btn').onclick = startRound;
$('submit-btn').onclick = () => { if ($('response').value.trim()) submit(); };
$('share-btn').onclick = share; $('check-btn').onclick = () => { busy = false; resumeRound(); };
$('recover-btn').onclick = () => { busy = false; if (challenge) openChallenge(challenge.challengeId); else if (pathMatch) pathMatch[1] === 'results' ? owner(pathMatch[2]) : openChallenge(pathMatch[2]); else resumeRound(); };
if (pathMatch) pathMatch[1] === 'challenge' ? openChallenge(pathMatch[2]) : owner(pathMatch[2]); else home();
