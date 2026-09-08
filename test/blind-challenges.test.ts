import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultTunables } from '../src/config/tunables.js';
import { seededRng, systemIdGen, testClock } from '../src/domain/runtime.js';
import { DemoProvider } from '../src/providers/demo.js';
import { GameStore } from '../src/store/store.js';
import { createGameServer } from '../src/web/server.js';
import { limitedProvider } from '../src/web/limits.js';
import { sharingReport } from '../src/lab/sharingReport.js';
import { GameSession, type GameEnv } from '../src/web/session.js';

const servers: Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function env(store = GameStore.open()): GameEnv {
  return { store, clock: testClock(), idGen: systemIdGen, tunables: defaultTunables,
    provider: new DemoProvider(seededRng(5)), rng: seededRng(17) };
}
async function serve(environment: GameEnv, options = {}) {
  const server = createGameServer(environment, options); servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}
function browser(base: string, initialCookie = '') {
  let cookie = initialCookie;
  return {
    cookie: () => cookie,
    async call(route: string, body?: unknown, headers: Record<string, string> = {}) {
      const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
        headers: { Cookie: cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const next = response.headers.get('set-cookie'); if (next) cookie = next.split(';')[0]!;
      const text = await response.text();
      return { status: response.status, data: JSON.parse(text) };
    },
  };
}
async function completed(b: ReturnType<typeof browser>) {
  const start = await b.call('/api/round', {}); expect(start.status).toBe(200);
  const id = start.data.roundId;
  const submitted = await b.call(`/api/round/${id}/submit`, { text: 'honestly just vibes and spite' });
  expect(submitted.status).toBe(200);
  const label = submitted.data.candidates[0].label;
  const finished = await b.call(`/api/round/${id}/taste`, { label }); expect(finished.status).toBe(200);
  const link = await b.call(`/api/round/${id}/challenge`, {}); expect(link.status).toBe(200);
  return { id, label, result: finished.data, challengeId: link.data.challengeId };
}

describe('Blind Tasting HTTP boundaries', () => {
  it('bounds concurrent provider work and rejects queue overflow', async () => {
    let calls = 0;
    const releases: (() => void)[] = [];
    const provider = limitedProvider({ async complete() {
      calls++;
      await new Promise<void>(resolve => releases.push(resolve));
      return { text: 'answer', provider: 'mock', model: 'mock', latencyMs: 0 };
    } }, 1, 1);
    const request = { system: '', user: '', maxTokens: 10 };
    const first = provider.complete(request);
    const second = provider.complete(request);
    await expect(provider.complete(request)).rejects.toThrow(/busy/);
    expect(calls).toBe(1);
    releases.shift()!(); await first;
    expect(calls).toBe(2);
    releases.shift()!(); await second;
  });

  it('attributes recipient creation and completion and excludes blank Taste picks', async () => {
    const environment = env(), base = await serve(environment);
    const creator = browser(base), recipient = browser(base);
    const original = await completed(creator);
    const route = `/api/challenge/${original.challengeId}`;
    await recipient.call(route);
    await recipient.call(route + '/lock', { detection: original.result.humanLabel, taste: original.result.humanLabel });
    await recipient.call(route + '/reveal', {});
    await recipient.call(route + '/share', {});
    await recipient.call(route + '/share', {});
    const started = await recipient.call('/api/round', { sourceChallengeId: original.challengeId });
    const id = started.data.roundId;
    const submitted = await recipient.call(`/api/round/${id}/submit`, { text: null });
    const result = await recipient.call(`/api/round/${id}/taste`, { label: submitted.data.candidates[0].label });
    await recipient.call(`/api/round/${id}/taste`, { label: submitted.data.candidates[0].label });
    const report = sharingReport(environment.store).challenges[0]!;
    expect(report).toMatchObject({ recipientShareActions: 1, downstreamRoundsStarted: 1, downstreamRoundsCompleted: 1 });
    expect(report.attempts[0]).toMatchObject({ shared: true, startedRoundIds: [id], completedRoundIds: [id] });
    const link = await recipient.call(`/api/round/${id}/challenge`, {});
    const blankRoute = `/api/challenge/${link.data.challengeId}`;
    expect((await creator.call(blankRoute + '/lock', { detection: result.data.humanLabel, taste: result.data.humanLabel })).status).toBe(400);
    expect((await creator.call(blankRoute + '/lock', { detection: result.data.humanLabel })).status).toBe(200);
  });

  it('replays the exact table, keeps locks private, survives reload, and isolates owner results', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slop-challenges-')); dirs.push(dir);
    const environment = env(GameStore.open(dir));
    const base = await serve(environment);
    const creator = browser(base), recipient = browser(base), stranger = browser(base);
    const round = await completed(creator);
    const route = `/api/challenge/${round.challengeId}`;
    const originalJudgments = environment.store.all('judgment');
    const originalSpecimens = environment.store.all('specimen');
    let calls = 0;
    environment.provider.complete = async () => { calls++; throw new Error('Replay must not call models'); };
    const opened = await recipient.call(route);
    expect(opened.status).toBe(200);
    expect(opened.data.candidates).toEqual(round.result.table.map((r: { label: string; text: string }) => ({ label: r.label, text: r.text })));
    for (const row of opened.data.candidates) expect(Object.keys(row).sort()).toEqual(['label', 'text']);
    expect(JSON.stringify(opened.data)).not.toMatch(/humanLabel|specimenId|creatorContestantId|Ballots|modelMetadata/);
    expect((await recipient.call(route + '/reveal', {})).status).toBe(409);
    expect((await recipient.call(`/api/round/${round.id}`)).status).toBe(404);
    expect((await recipient.call(`/api/round/${round.id}/taste`, { label: round.label })).status).toBe(404);
    expect((await recipient.call(route + '/owner')).status).toBe(404);
    expect((await creator.call(route)).data.preview).toBe(true);
    const choices = { detection: round.result.humanLabel, taste: null };
    const locks = await Promise.all([recipient.call(route + '/lock', choices), recipient.call(route + '/lock', choices)]);
    expect(locks.map(r => r.status)).toEqual([200, 200]);
    expect(locks[0]!.data.state).toBe('locked');
    expect(locks[0]!.data.results).toBeUndefined();
    expect((await creator.call(route + '/owner')).data.attempts).toEqual([]);
    const other = opened.data.candidates.find((r: { label: string }) => r.label !== choices.detection).label;
    expect((await recipient.call(route + '/lock', { detection: other })).status).toBe(409);
    expect((await stranger.call(route + '/reveal', {})).status).toBe(409);
    const freshEnv = env(GameStore.open(dir));
    freshEnv.provider.complete = async () => { calls++; throw new Error('No replay model calls'); };
    const nextBase = await serve(freshEnv);
    const returning = browser(nextBase, recipient.cookie());
    const owner = browser(nextBase, creator.cookie());
    expect((await returning.call(route)).data.state).toBe('locked');
    const revealed = await returning.call(route + '/reveal', {});
    expect(revealed.data.results.humanLabel).toBe(round.result.humanLabel);
    await returning.call(route + '/reveal', {});
    expect((await returning.call(route)).data.state).toBe('revealed');
    const results = await owner.call(route + '/owner');
    expect(results.data.attempts).toEqual([expect.objectContaining({ correct: true, detection: choices.detection, taste: null })]);
    await owner.call(route + '/owner');
    expect(freshEnv.store.where('sharingEvent', e => e.type === 'owner_results_viewed' && e.count === 1)).toHaveLength(1);
    expect(freshEnv.store.where('sharingEvent', e => e.type === 'guess_locked')).toHaveLength(1);
    expect(freshEnv.store.where('sharingEvent', e => e.type === 'reveal_viewed')).toHaveLength(1);
    expect(freshEnv.store.all('judgment')).toEqual(originalJudgments);
    expect(freshEnv.store.all('specimen')).toEqual(originalSpecimens);
    expect(sharingReport(freshEnv.store)).toMatchObject({ eligibleOwners: 1, returningOwners: 1, challenges: [expect.objectContaining({ lockedAttempts: 1, revealedAttempts: 1, newlySeenCompletedAttempts: 1 })] });
    expect(calls).toBe(0);
  });

  it('blocks debug surfaces and cross-site writes and bounds public generation and bodies', async () => {
    const environment = env(); const base = await serve(environment, { limits: { maxPlayerRoundsPerHour: 1 } }); const b = browser(base);
    for (const route of ['/lab', '/lab.html', '/studio', '/api/lab/rounds', '/api/studio/prompts']) expect((await b.call(route)).status).toBe(404);
    expect((await b.call('/api/studio/generate', { promptId: 'anything' })).status).toBe(404);
    expect((await b.call('/api/round', {}, { Origin: 'https://other.example' })).status).toBe(403);
    expect((await b.call('/api/round', { text: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await b.call('/api/round', { requestId: 'retry-me' })).status).toBe(200);
    expect((await b.call('/api/round', { requestId: 'retry-me' })).data.resumed).toBe(true);
    expect(environment.store.all('round')).toHaveLength(1);
    expect((await b.call('/api/round', {})).status).toBe(429);
    expect((await b.call('/api/challenge/missing')).status).toBe(404);
  });

  it('deduplicates concurrent submission and completion, isolates humans, and snapshots scores', async () => {
    const environment = env(), base = await serve(environment);
    const a = browser(base), b = browser(base);
    const first = (await a.call('/api/round', {})).data;
    const second = (await b.call('/api/round', {})).data;
    expect(environment.store.get('round', first.roundId).humanContestantId).not.toBe(environment.store.get('round', second.roundId).humanContestantId);
    const route = `/api/round/${first.roundId}`;
    const submissions = await Promise.all([a.call(route + '/submit', { text: 'original answer' }), a.call(route + '/submit', { text: 'original answer' })]);
    expect(submissions.map(s => s.status)).toEqual([200, 200]);
    expect((await a.call(route + '/submit', { text: 'changed answer' })).status).toBe(409);
    const label = submissions[0]!.data.candidates[0].label;
    const votes = await Promise.all([a.call(route + '/taste', { label }), a.call(route + '/taste', { label })]);
    expect(votes.map(v => v.status)).toEqual([200, 200]);
    expect(votes[0]!.data).toEqual(votes[1]!.data);
    expect((await a.call(route + '/taste', { label })).data).toEqual(votes[0]!.data);
    const different = submissions[0]!.data.candidates[1].label;
    expect((await a.call(route + '/taste', { label: different })).status).toBe(409);
    const reconfigured = { ...environment, tunables: { ...defaultTunables, scoring: { ...defaultTunables.scoring, deceptionBase: 900 } } };
    expect(new GameSession(reconfigured).read(first.roundId)).toMatchObject({ results: votes[0]!.data });
    expect(environment.store.where('judgment', j => j.roundId === first.roundId)).toHaveLength(11);
  });

  it('enforces the deadline and reports interrupted writing after restart', async () => {
    const clock = testClock(); const environment = { ...env(), clock };
    const session = new GameSession(environment);
    const start = session.startRound();
    expect(new GameSession(environment).read(start.roundId)).toMatchObject({ failure: expect.stringContaining('restart') });
    clock.advance(47_000);
    const submitted = await session.submit(start.roundId, 'too late');
    expect(submitted.blank).toBe(true);
    const result = await session.castTaste(start.roundId, submitted.candidates[0]!.label);
    expect(result.blank).toBe(true);
  });
});
