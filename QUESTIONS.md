# Open questions

## Q1 — SPEC §3 "elaborate animations" vs. table play (2026-11-03)

**Context.** SPEC §3 lists "elaborate animations" among things the prototype should not spend substantial time on. In the 2026-11-03 session the developer explicitly directed a visual direction: the whole Blind Tasting round plays at a dinner table, and the reveal becomes a watchable sequence (guests place suspicion picks one by one, the lid lifts, a Fooled meter fills, forks land on favorites). See [`docs/spec-table-play.md`](./docs/spec-table-play.md).

CLAUDE.md forbids editing SPEC without an explicit instruction, so SPEC is untouched.

**Options.**
1. Treat table play as a docs-level presentation addendum (like the tasting-club artwork), leaving SPEC §3 as written.
2. Amend SPEC §3 to say watchable reveal choreography is in scope because it is part of what is being tested for fun.

**Recommendation.** Option 1 until playtests show the table makes rounds more replayable; then consider option 2. The implementation is client-only, dependency-free CSS/DOM, and changes no game law, server payload, or score, so it is cheap to keep or revert.
