/*
 * Creatures under the cloches: each plate's stakes, made visible (docs/spec-table-play.md).
 * Everything here is a pure function of an answer's text plus the public stakes tunables
 * ({riskTiers, deceptionBase}). It never sees labels, authorship, or ballots, so a creature
 * can't hint at who wrote a plate. Every plate, human or machine, is drawn the same way.
 */

/** Derives the word count exactly as the server does (src/engine/text.ts countWords). */
export function wordCount(text) {
  const trimmed = String(text ?? '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

const KINDS = ['safe', 'bold', 'dangerous'];

/** Derives a stable 32-bit hash of a string (FNV-1a), used only to vary looks. */
export function textHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Derives the creature for one answer: species from its length tier, the most it could
 * earn if it fooled every judge, and cosmetic traits from a hash of its text.
 */
export function creatureFor(text, { riskTiers = [], deceptionBase = 0 } = {}) {
  const words = wordCount(text);
  const tiers = [...riskTiers].sort((a, b) => a.min - b.min);
  if (words === 0 || !tiers.length) return { kind: 'blank', words, tier: null, multiplier: 0, base: deceptionBase, maxPoints: 0, traits: traitsFor(text) };
  let index = tiers.findIndex(t => words >= t.min && words <= t.max);
  if (index === -1) index = words > tiers[tiers.length - 1].max ? tiers.length - 1 : 0;
  const tier = tiers[index];
  const kind = KINDS[Math.min(Math.round(index * (KINDS.length - 1) / Math.max(1, tiers.length - 1)), KINDS.length - 1)];
  return { kind, words, tier: tier.name, multiplier: tier.multiplier, base: deceptionBase, maxPoints: pointsFor({ base: deceptionBase, multiplier: tier.multiplier, kind }, 0, 1), traits: traitsFor(text) };
}

/** Derives deception points after `found` of `of` judges spotted it, matching src/scoring computeResults. */
export function pointsFor(creature, found, of) {
  if (creature.kind === 'blank' || of <= 0) return 0;
  const deceptionRate = (of - found) / of;
  return Math.round(creature.base * deceptionRate * creature.multiplier);
}

/** Derives the short rim tag for a creature, e.g. "BOLD · up to 125". */
export function stakeTag(creature) {
  return creature.kind === 'blank' ? 'Empty · 0' : `${creature.tier} · up to ${creature.maxPoints}`;
}

function traitsFor(text) {
  const h = textHash(text);
  return {
    hue: h % 360,
    eyes: (h >>> 9) % 3,        // 0..2, added to the species' base eye count
    pattern: (h >>> 11) % 3,    // 0 none, 1 spots, 2 stripes
    crest: (h >>> 13) % 3,      // species-specific head ornament
    tilt: ((h >>> 15) % 9) - 4, // degrees
  };
}

const n = v => Number(v.toFixed(2));

function eyesAt(count, cx, cy, spread, r, { sleepy = false, ink = '#281020' } = {}) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = n(count === 1 ? cx : cx - spread / 2 + (spread * i) / (count - 1));
    const y = n(cy - (count > 2 && i % 2 ? r * 0.9 : 0));
    out += sleepy
      ? `<path d="M${n(x - r)} ${y}q${r} ${n(r * 0.9)} ${n(r * 2)} 0" fill="none" stroke="${ink}" stroke-width="1" stroke-linecap="round"/>`
      : `<circle cx="${x}" cy="${y}" r="${r}" fill="#fffdf6"/><circle cx="${n(x + r * 0.2)}" cy="${n(y + r * 0.15)}" r="${n(r * 0.5)}" fill="${ink}"/>`;
  }
  return out;
}

function pattern(kind, t, cx, cy, rx, ry, color) {
  if (t.pattern === 1) {
    return [[-0.45, 0.25], [0.4, 0.35], [0.05, 0.55]].map(([dx, dy]) =>
      `<circle cx="${n(cx + dx * rx)}" cy="${n(cy + dy * ry)}" r="${n(Math.max(1, rx * 0.12))}" fill="${color}"/>`).join('');
  }
  if (t.pattern === 2) {
    // Short flank stripes, kept clear of the face and mouth.
    return [-0.82, -0.66, 0.66, 0.82].map(dx =>
      `<path d="M${n(cx + dx * rx)} ${n(cy - ry * 0.05)}l0 ${n(ry * 0.4)}" stroke="${color}" stroke-width="${kind === 'safe' ? 1 : 1.4}" stroke-linecap="round"/>`).join('');
  }
  return '';
}

/**
 * Builds the creature's SVG markup in the cloche's 80×54 viewBox (a <g>, numbers and colours
 * only — no answer text is ever interpolated).
 */
export function creatureSvg(creature) {
  const t = creature.traits;
  const body = `hsl(${t.hue} 62% 64%)`;
  const shade = `hsl(${t.hue} 45% 40%)`;
  const accent = `hsl(${(t.hue + 150) % 360} 70% 62%)`;
  // Outer group takes CSS motion; the inner one keeps the per-text tilt.
  const g = inner => `<g class="critter critter-${creature.kind}"><g transform="rotate(${t.tilt} 40 46)">${inner}</g></g>`;

  if (creature.kind === 'blank') {
    return g('<circle class="mote" cx="44" cy="43" r="1.3" fill="#b9aab0"/>');
  }
  if (creature.kind === 'safe') {
    // A small curled blob, asleep.
    const ears = ['', `<circle cx="34" cy="37.5" r="2" fill="${body}"/><circle cx="46" cy="37.5" r="2" fill="${body}"/>`, `<path d="M40 36q-1-4 2-5" fill="none" stroke="${shade}" stroke-width="1" stroke-linecap="round"/>`][t.crest];
    return g(`${ears}<ellipse class="body" cx="40" cy="42.5" rx="11" ry="5.5" fill="${body}" stroke="${shade}" stroke-width="1"/>`
      + pattern('safe', t, 40, 41, 11, 5.5, shade)
      + eyesAt(1 + Math.min(t.eyes, 1), 40, 41.5, 6, 1.4, { sleepy: true })
      + `<text class="zzz" x="50" y="35" font-size="5" font-family="Georgia, serif" font-style="italic" fill="${shade}">z</text>`);
  }
  if (creature.kind === 'bold') {
    // A horned, wide-eyed critter on stubby feet.
    const crest = [
      `<path d="M33 31l-3-7 6 4zM47 31l3-7-6 4z" fill="${accent}" stroke="${shade}" stroke-width=".8"/>`,
      `<path d="M37 28q-2-6-6-7M43 28q2-6 6-7" fill="none" stroke="${shade}" stroke-width="1.2" stroke-linecap="round"/><circle cx="31" cy="21" r="1.6" fill="${accent}"/><circle cx="49" cy="21" r="1.6" fill="${accent}"/>`,
      `<path d="M34 30l3-6 3 5 3-5 3 6z" fill="${accent}" stroke="${shade}" stroke-width=".8"/>`,
    ][t.crest];
    return g(`<ellipse cx="35" cy="45.5" rx="3" ry="1.6" fill="${shade}"/><ellipse cx="45" cy="45.5" rx="3" ry="1.6" fill="${shade}"/>`
      + crest
      + `<ellipse class="body" cx="40" cy="37" rx="12" ry="9.5" fill="${body}" stroke="${shade}" stroke-width="1"/>`
      + pattern('bold', t, 40, 37, 12, 9.5, shade)
      + eyesAt(2 + Math.min(t.eyes, 1), 40, 35, 9, 2.4)
      + `<path d="M36 41q4 3 8 0" fill="none" stroke="${shade}" stroke-width="1" stroke-linecap="round"/>`);
  }
  // DANGEROUS: a spiky, many-eyed beast too big for its plate; a tentacle escapes the lid.
  const spikes = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI * (1.05 + (i / 8) * 0.9);
    const x = 40 + Math.cos(a) * 15, y = 32 + Math.sin(a) * 13;
    const tx = 40 + Math.cos(a) * 21, ty = 32 + Math.sin(a) * 19;
    const side = 0.18;
    return `<path d="M${n(40 + Math.cos(a - side) * 14)} ${n(32 + Math.sin(a - side) * 12)}L${n(tx)} ${n(ty)}L${n(40 + Math.cos(a + side) * 14)} ${n(32 + Math.sin(a + side) * 12)}" fill="${accent}" stroke="${shade}" stroke-width=".8"/>`;
  }).join('');
  const tentacle = [
    `<path class="tentacle" d="M58 44q10 0 14-5q3-4 0-6" fill="none" stroke="${body}" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path class="tentacle" d="M22 44q-10 1-14-4q-2-4 2-6" fill="none" stroke="${body}" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path class="tentacle" d="M58 44q9 1 13-3M22 44q-9 1-13-3" fill="none" stroke="${body}" stroke-width="2.6" stroke-linecap="round"/>`,
  ][t.crest];
  return g(tentacle + spikes
    + `<path class="body" d="M23 46c-1-12 6-26 17-26s18 14 17 26z" fill="${body}" stroke="${shade}" stroke-width="1"/>`
    + pattern('dangerous', t, 40, 34, 14, 12, shade)
    + eyesAt(3 + t.eyes, 40, 31, 15, 2.2)
    + `<path d="M32 40l2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3" fill="#fffdf6" stroke="${shade}" stroke-width=".7" stroke-linejoin="round"/>`);
}
