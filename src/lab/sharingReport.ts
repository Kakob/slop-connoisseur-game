/** Local pilot report derived from immutable attempts, reveal records, and funnel events. */
import type { GameStore } from '../store/store.js';

/** Reports deduplicated attempts and creator return; anonymous browsers are not people. */
export function sharingReport(store: GameStore) {
  const events = store.all('sharingEvent');
  const rows = store.all('challenge').map(challenge => {
    const attempts = store.where('challengeAttempt', a => a.challengeId === challenge.id);
    const completed = attempts.filter(a => store.has('attemptReveal', a.id));
    const locks = attempts.filter(a => store.has('attemptLock', a.id));
    const visits = events.filter(e => e.challengeId === challenge.id && e.type === 'owner_results_viewed');
    const relevant = events.filter(e => e.challengeId === challenge.id);
    const downstream = relevant.filter(e => e.type === 'new_round_started' && e.playerId !== challenge.ownerId);
    const completedDownstream = relevant.filter(e => e.type === 'new_round_completed' && e.playerId !== challenge.ownerId);
    const appearances = store.where('appearance', a => a.roundId === challenge.roundId);
    const timeToLockMs = locks.map(a => Date.parse(store.get('attemptLock', a.id).createdAt) - Date.parse(a.createdAt));
    return {
      challengeId: challenge.id,
      lineupWords: appearances.reduce((sum, a) => sum + store.get('specimen', a.specimenId).wordCount, 0),
      openedAttempts: attempts.length, lockedAttempts: locks.length, revealedAttempts: completed.length,
      openedWithoutLock: attempts.length - locks.length, lockedWithoutReveal: locks.length - completed.length,
      timeToLockMs,
      creatorShareActions: relevant.filter(e => e.type === 'creator_share_action').length,
      recipientShareActions: relevant.filter(e => e.type === 'recipient_share_action').length,
      downstreamRoundsStarted: downstream.length, downstreamRoundsCompleted: completedDownstream.length,
      ownerReturnedAfterCompletion: visits.some(v => (v.count ?? 0) > 0),
      newlySeenCompletedAttempts: Math.max(0, ...visits.map(v => v.count ?? 0)),
      emptyOwnerChecks: visits.filter(v => v.count === 0).length,
      attempts: attempts.map(a => ({
        attemptId: a.id, openedAt: a.createdAt,
        lockedAt: store.has('attemptLock', a.id) ? store.get('attemptLock', a.id).createdAt : null,
        revealedAt: store.has('attemptReveal', a.id) ? store.get('attemptReveal', a.id).createdAt : null,
        shared: relevant.some(e => e.type === 'recipient_share_action' && e.playerId === a.playerId),
        startedRoundIds: downstream.filter(e => e.playerId === a.playerId).map(e => e.roundId),
        completedRoundIds: completedDownstream.filter(e => e.playerId === a.playerId).map(e => e.roundId),
      })),
    };
  });
  const eligibleOwnerIds = new Set(store.all('challenge').filter(c => rows.find(r => r.challengeId === c.id)!.revealedAttempts > 0).map(c => c.ownerId));
  const returningOwnerIds = new Set(store.all('challenge').filter(c => rows.find(r => r.challengeId === c.id)!.ownerReturnedAfterCompletion).map(c => c.ownerId));
  return {
    notes: 'Counts describe browser attempts, not verified people. Creator previews are excluded. Share actions do not prove delivery. Empty owner checks are deduplicated per challenge; time-to-lock does not prove reading. Unfinished attempts may return later.',
    eligibleOwners: eligibleOwnerIds.size, returningOwners: returningOwnerIds.size,
    challenges: rows,
  };
}
