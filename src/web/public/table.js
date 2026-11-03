/*
 * Table play: the round's board (docs/spec-table-play.md).
 * Pure beat derivation (testable, no DOM at import) plus a dependency-free DOM scene.
 * Before reveal the scene sees only {label, text}; guests unmask only from post-reveal ballots.
 */

/** Presentation timings in milliseconds — the only place animation pacing is set. */
export const TIMING = {
  serveStagger: 160, unmask: 1000, suspect: 850, abstain: 550, lift: 1600,
  found: 500, fooled: 650, verdict: 1300, favorite: 550, summary: 0,
};

/** Seat keys for the two people who are not machine guests. */
export const YOU = '@you';
export const FRIEND = '@friend';

const COLORS = ['#f08a6c', '#8fc7d9', '#e8b84a', '#c7a0e0', '#7fd1a8', '#f2a5c0', '#b9c6f0'];
const PLAYER = '#d1df64';

/** Derives pre-reveal plates from candidates, copying only label and text. */
export function tableModel(candidates, { ownLabel = null, ownText = '' } = {}) {
  const plates = candidates.map(c => ({ label: String(c.label), text: String(c.text ?? ''), own: c.label === ownLabel }));
  if (ownLabel && !plates.some(p => p.label === ownLabel)) plates.push({ label: ownLabel, text: String(ownText), own: true });
  return plates.sort((a, b) => a.label.localeCompare(b.label));
}

/** Derives the creator's own label: the first position letter missing from their taste candidates. */
export function ownLabelFor(candidates) {
  const taken = new Set(candidates.map(c => c.label));
  for (let i = 0; i <= candidates.length; i++) {
    const label = String.fromCharCode(65 + i);
    if (!taken.has(label)) return label;
  }
  return null;
}

/** Derives a short badge from a display name, ignoring a leading "The". */
export function initialsOf(name) {
  const words = String(name).split(/\s+/).filter(w => w && !/^the$/i.test(w));
  return (words.map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();
}

/** Derives the unmasked guest roster from post-reveal results: machine writers and judges, alphabetical. */
export function seatGuests(results) {
  const names = new Set(results.table.filter(r => r.creatorKind === 'machine').map(r => r.creatorDisplayName));
  for (const b of [...results.detectionBallots, ...results.machineTasteBallots]) names.add(b.judgeDisplayName);
  return [...names].sort((a, b) => a.localeCompare(b))
    .map((name, i) => ({ name, initials: initialsOf(name), color: COLORS[i % COLORS.length] }));
}

/** Derives the ordered reveal beats from post-reveal results; every count comes from the ballots. */
export function revealBeats(results, { viewer = 'creator', choices = null } = {}) {
  const guests = seatGuests(results);
  const human = results.humanLabel;
  const humanWho = viewer === 'creator' ? YOU : FRIEND;
  const judges = results.detectionBallots.length;
  const beats = [{ type: 'unmask', guests, text: 'The guests take off their masks.' }];

  const myPick = viewer === 'recipient' ? choices?.detection ?? null : null;
  if (myPick) beats.push({ type: 'suspect', who: YOU, label: myPick, text: `You plant your pick in ${myPick}.` });
  const guessed = new Set();
  for (const b of results.detectionBallots) {
    guessed.add(b.judgeDisplayName);
    beats.push({ type: 'suspect', who: b.judgeDisplayName, label: b.chosenLabel, text: `${b.judgeDisplayName} suspects ${b.chosenLabel}.` });
  }
  for (const g of guests) if (!guessed.has(g.name)) beats.push({ type: 'abstain', who: g.name, vote: 'detection', text: `${g.name} didn’t cast a guess.` });

  const liftText = results.blank ? `${human} was an empty plate.` : viewer === 'creator' ? `You cooked ${human}.` : `Your friend cooked ${human}.`;
  beats.push({ type: 'lift', who: humanWho, label: human, blank: !!results.blank, of: judges, text: liftText });
  if (myPick) {
    const found = myPick === human;
    beats.push({ type: 'verdict', who: YOU, label: myPick, found, text: found ? 'You found your friend.' : `Your friend fooled you. You picked ${myPick}.` });
  }

  // Finds first, then the fooled meter fills: the crescendo is the human getting away with it.
  for (const b of results.detectionBallots.filter(b => b.chosenLabel === human)) {
    beats.push({ type: 'found', who: b.judgeDisplayName, label: b.chosenLabel, text: `${b.judgeDisplayName} found the human.` });
  }
  let fooled = 0;
  for (const b of results.detectionBallots.filter(b => b.chosenLabel !== human)) {
    fooled += 1;
    beats.push({ type: 'fooled', who: b.judgeDisplayName, label: b.chosenLabel, fooled, of: judges, text: `${b.judgeDisplayName} was fooled.` });
  }

  const tasted = new Set();
  for (const b of results.machineTasteBallots) {
    tasted.add(b.judgeDisplayName);
    beats.push({ type: 'favorite', who: b.judgeDisplayName, label: b.chosenLabel, text: `${b.judgeDisplayName} would rather have written ${b.chosenLabel}.` });
  }
  for (const g of guests) if (!tasted.has(g.name)) beats.push({ type: 'abstain', who: g.name, vote: 'taste', text: `${g.name} didn’t pick a favorite.` });
  if (results.humanTasteLabel) {
    const l = results.humanTasteLabel;
    beats.push({ type: 'favorite', who: humanWho, label: l, text: viewer === 'creator' ? `Your favorite was ${l}.` : `Your friend’s favorite was ${l}.` });
  }
  if (viewer === 'recipient' && choices?.taste) beats.push({ type: 'favorite', who: YOU, label: choices.taste, text: `Your favorite: ${choices.taste}.` });

  const tasteJudges = results.machineTasteBallots.length;
  const tasteForHuman = results.machineTasteBallots.filter(b => b.chosenLabel === human).length;
  beats.push({ type: 'summary', fooled, of: judges, tasteForHuman, tasteJudges, text: `${fooled} of ${judges} AI judges missed the human.` });
  return beats;
}

/* ---------- DOM scene (browser only; nothing below runs at import) ---------- */

const GUEST_SVG = `<svg viewBox="0 0 60 64" aria-hidden="true" class="guest-svg">
  <path class="coat" d="M6 64c1-15 10-22 24-22s23 7 24 22z"/>
  <circle class="face" cx="30" cy="25" r="14"/>
  <path class="hair" d="M16 23c0-10 7-15 14-15s14 5 14 15c-4-5-9-7-14-7s-10 2-14 7z"/>
  <g class="mask"><path d="M12 24c4-4 11-5 18-2 7-3 14-2 18 2-1 6-6 9-11 8-3 0-5-3-7-3s-4 3-7 3c-5 1-10-2-11-8z"/>
  <ellipse class="eye" cx="22.5" cy="25.5" rx="3.4" ry="2.2"/><ellipse class="eye" cx="37.5" cy="25.5" rx="3.4" ry="2.2"/></g>
</svg>`;
const CLOCHE_SVG = `<svg viewBox="0 0 80 54" aria-hidden="true" class="cloche-svg">
  <ellipse class="dish" cx="40" cy="47" rx="37" ry="6"/>
  <g class="lid"><path d="M8 44c0-18 14-30 32-30s32 12 32 30z"/><path class="shine" d="M18 38c1-9 7-16 15-18"/>
  <circle class="knob" cx="40" cy="11" r="4"/></g>
</svg>`;
const FORK_SVG = '<svg viewBox="0 0 12 24" aria-hidden="true"><path d="M2 1v7c0 2 1.5 3 3 3.4V23h2V11.4C8.5 11 10 10 10 8V1H8.6v6H7.4V1H6v6H4.6V1H3.4v6H3V1z" fill="currentColor"/></svg>';

const guestInfo = new WeakMap();

function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function infoFor(root, who) {
  if (who === YOU) return { name: 'You', initials: 'YOU', color: PLAYER };
  if (who === FRIEND) return { name: 'Your friend', initials: '★', color: PLAYER };
  return guestInfo.get(root)?.get(who) ?? { name: who, initials: initialsOf(who), color: PLAYER };
}
function plateEl(root, label) { return root.querySelector(`.plate[data-label="${CSS.escape(label)}"]`); }
function seatEl(root, who) {
  if (who === YOU && root.dataset.viewer === 'recipient') return root.querySelector('.hand') ?? root.querySelector('.caption');
  return root.querySelector(`.seat[data-who="${CSS.escape(who)}"]`);
}
function token(root, who, kind) {
  const info = infoFor(root, who);
  const el = h('span', `token ${kind}`);
  el.dataset.who = who; el.style.setProperty('--c', info.color); el.title = info.name;
  if (kind === 'fork') el.innerHTML = FORK_SVG; else el.textContent = info.initials;
  return el;
}
function say(seat, text) {
  if (!seat) return;
  const bubble = seat.querySelector('.bubble');
  if (bubble) { bubble.textContent = text; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
}

/** Animates a token from a seat to a plate, then leaves it on the plate. */
function deliver(root, who, label, kind, animate) {
  const plate = plateEl(root, label);
  if (!plate) return null;
  const tray = plate.querySelector(kind === 'fork' ? '.forks' : '.picks');
  const el = token(root, who, kind);
  const seat = seatEl(root, who);
  if (seat && !seat.classList.contains('hand')) { seat.classList.remove('lean'); void seat.offsetWidth; seat.classList.add('lean'); }
  tray.append(el);
  if (!animate || !seat || typeof el.animate !== 'function') return el;
  el.classList.add('pending');
  const from = seat.getBoundingClientRect(); const to = tray.getBoundingClientRect();
  const flyer = token(root, who, kind); flyer.classList.add('flying');
  flyer.style.left = `${from.left + from.width / 2}px`; flyer.style.top = `${from.top + from.height / 2}px`;
  document.body.append(flyer);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2); const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  flyer.animate([
    { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 40}px)) scale(1.25)`, opacity: 1, offset: 0.5 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 },
  ], { duration: Math.min(600, TIMING.suspect - 100), easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => { flyer.remove(); el.classList.remove('pending'); el.classList.add('land'); };
  return el;
}

/**
 * Builds the table scene. Plates come from tableModel (label/text only); guests are masked
 * silhouettes until a reveal beat unmasks them. Returns small controls for the caller.
 */
export function mountTable(el, { plates = [], viewer = 'creator', phase = 'tasting', actions = [], guestCount = 5 } = {}, { onAction = () => {} } = {}) {
  const root = h('div', 'scene'); root.dataset.phase = phase; root.dataset.viewer = viewer;

  const seats = h('div', 'seats');
  const order = Array.from({ length: guestCount }, (_, i) => i);
  order.splice(Math.ceil(guestCount / 2), 0, -1);
  for (const i of order) {
    const human = i === -1;
    const seat = h('div', `seat${human ? ' human' : ''}`);
    if (human) seat.dataset.who = viewer === 'creator' ? YOU : FRIEND; else seat.dataset.seat = String(i);
    const guest = h('div', 'guest'); guest.innerHTML = GUEST_SVG;
    if (!human) guest.style.animationDelay = `${-i * 0.7}s`;
    seat.append(h('span', 'bubble'), guest, h('span', 'nameplate', human ? (viewer === 'creator' ? 'You' : 'Your friend') : 'Masked guest'));
    seats.append(seat);
  }

  const cloth = h('div', 'tablecloth');
  const lazySusan = h('div', 'plates');
  for (const [i, p] of plates.entries()) {
    const plate = h('button', `plate${p.own ? ' own' : ''}`);
    plate.type = 'button'; plate.dataset.label = p.label;
    plate.style.setProperty('--i', String(i));
    plate.setAttribute('aria-label', p.own ? `Answer ${p.label}, your own answer` : `Open answer ${p.label}`);
    const cloche = h('span', 'cloche'); cloche.innerHTML = CLOCHE_SVG;
    plate.append(h('span', 'picks'), cloche, h('span', 'plate-label', p.label), h('span', 'plate-badge', p.own ? 'Yours' : ''), h('span', 'forks'));
    plate.onclick = () => open(p.label);
    lazySusan.append(plate);
  }
  if (!plates.length) lazySusan.append(h('p', 'empty-cloth', 'The kitchen is busy…'));
  cloth.append(lazySusan);

  const meter = h('div', 'meter'); meter.hidden = true;
  const caption = h('p', 'caption'); caption.setAttribute('aria-live', 'polite');
  const reading = h('div', 'reading'); reading.hidden = true;
  const readingLabel = h('p', 'reading-label'); const readingText = h('p', 'reading-text'); const readingActions = h('div', 'reading-actions');
  reading.append(readingLabel, readingText, readingActions);

  root.append(seats, cloth, meter, caption);
  let hand = null;
  if (viewer === 'recipient' && phase === 'guessing') {
    hand = h('div', 'hand');
    hand.append(h('span', 'hand-hint', 'Drag onto a plate, or open one:'));
    for (const [kind, text] of [['detection', 'Your pick'], ['taste', 'Your fork']]) {
      const t = token(root, YOU, kind === 'detection' ? 'pick' : 'fork');
      t.classList.add('draggable'); t.dataset.kind = kind; t.setAttribute('aria-hidden', 'true');
      const wrap = h('span', 'hand-item'); wrap.append(t, h('span', '', text)); hand.append(wrap);
      enableDrag(t, label => { open(label); onAction(kind, label); });
    }
    root.append(hand);
  }
  root.append(reading);
  el.replaceChildren(root);

  let current = null;
  function open(label) {
    const p = plates.find(x => x.label === label);
    if (!p || p.own) return;
    current = label;
    for (const b of root.querySelectorAll('.plate')) { const on = b.dataset.label === label; b.classList.toggle('open', on); b.setAttribute('aria-pressed', String(on)); }
    readingLabel.textContent = `Answer ${p.label}`; readingText.textContent = p.text;
    readingActions.replaceChildren(...actions.map(a => {
      const b = h('button', a.secondary ? 'secondary' : '', a.text); b.type = 'button';
      b.disabled = root.classList.contains('locked');
      b.onclick = () => onAction(a.key, label); return b;
    }));
    reading.hidden = false;
  }

  return {
    root, open,
    /** Places the viewer's single pick or fork on a plate, moving it if already placed. */
    mark(kind, label) {
      const cls = kind === 'detection' ? 'pick' : 'fork';
      root.querySelector(`.plates .token.${cls}[data-who="${YOU}"]`)?.remove();
      if (label) plateEl(root, label)?.querySelector(cls === 'pick' ? '.picks' : '.forks').append(token(root, YOU, cls));
    },
    setLocked(locked) {
      root.classList.toggle('locked', locked);
      for (const b of readingActions.querySelectorAll('button')) b.disabled = locked;
      if (hand) hand.hidden = locked;
    },
  };
}

function enableDrag(handle, onDrop) {
  handle.addEventListener('pointerdown', down => {
    down.preventDefault();
    const ghost = handle.cloneNode(true); ghost.classList.add('flying', 'dragging');
    document.body.append(ghost);
    const move = e => { ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`; ghost.style.transform = 'translate(-50%,-50%) scale(1.3)'; };
    move(down);
    const up = e => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      ghost.remove();
      const plate = document.elementFromPoint(e.clientX, e.clientY)?.closest('.plate:not(.own)');
      if (plate && e.type === 'pointerup') onDrop(plate.dataset.label);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}

/** Applies one reveal beat to the scene; with animate=false it draws the end state of that beat. */
export function applyBeat(root, beat, animate = false) {
  const caption = root.querySelector('.caption');
  if (caption) caption.textContent = beat.text;
  const seat = beat.who ? seatEl(root, beat.who) : null;
  switch (beat.type) {
    case 'unmask': {
      const map = new Map(beat.guests.map(g => [g.name, g])); guestInfo.set(root, map);
      for (const [i, g] of beat.guests.entries()) {
        const s = root.querySelector(`.seat[data-seat="${i}"]`);
        if (!s) continue;
        s.dataset.who = g.name; s.style.setProperty('--coat', g.color); s.classList.add('unmasked');
        s.querySelector('.nameplate').textContent = g.name;
      }
      root.dataset.phase = 'reveal';
      break;
    }
    case 'suspect': deliver(root, beat.who, beat.label, 'pick', animate); break;
    case 'abstain': say(seat, '…'); seat?.classList.add('abstain'); break;
    case 'lift': {
      const plate = plateEl(root, beat.label);
      if (plate) {
        plate.classList.add('open', 'human');
        plate.querySelector('.plate-badge').textContent = beat.blank ? 'Empty plate' : beat.who === YOU ? 'You' : 'Your friend';
        if (animate) { const burst = h('span', 'burst'); plate.append(burst); setTimeout(() => burst.remove(), 1400); }
      }
      root.querySelector(`.seat.human`)?.classList.add('unmasked', 'spotlight');
      const meter = root.querySelector('.meter');
      if (meter && beat.of > 0) {
        meter.hidden = false;
        meter.replaceChildren(h('span', 'meter-label', 'Fooled'), ...Array.from({ length: beat.of }, () => h('i')), h('b', 'meter-count', `0 / ${beat.of}`));
      }
      break;
    }
    case 'verdict': {
      const mine = root.querySelector(`.plates .token.pick[data-who="${YOU}"]`);
      mine?.classList.add(beat.found ? 'hit' : 'miss');
      root.classList.add(beat.found ? 'you-found' : 'you-fooled');
      break;
    }
    case 'found':
    case 'fooled': {
      const mark = [...(plateEl(root, beat.label)?.querySelectorAll('.token.pick') ?? [])].find(t => t.dataset.who === beat.who);
      mark?.classList.add(beat.type === 'found' ? 'hit' : 'miss');
      seat?.classList.add(beat.type);
      say(seat, beat.type === 'found' ? 'Aha!' : '?!');
      if (beat.type === 'fooled') {
        const segs = root.querySelectorAll('.meter i');
        segs[beat.fooled - 1]?.classList.add('on');
        const count = root.querySelector('.meter-count'); if (count) count.textContent = `${beat.fooled} / ${beat.of}`;
      }
      break;
    }
    case 'favorite': deliver(root, beat.who, beat.label, 'fork', animate); say(seat, '♥'); break;
    case 'summary': root.dataset.phase = 'done'; break;
  }
}

function wait(ms, signal) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/** Plays reveal beats in order; aborting the signal draws every remaining beat instantly. */
export async function playBeats(root, beats, { signal } = {}) {
  for (const [i, beat] of beats.entries()) {
    if (signal?.aborted) { for (const rest of beats.slice(i)) applyBeat(root, rest, false); return; }
    applyBeat(root, beat, true);
    await wait(TIMING[beat.type] ?? 600, signal);
  }
}

/** Draws the reveal's end state without motion. */
export function renderFinal(root, beats) {
  for (const beat of beats) applyBeat(root, beat, false);
}
