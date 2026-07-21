# A3RO — Strategic Programming Mission

**Owner:** Daniel · **Created:** 2026-07-21 · **Horizon:** 4 weeks

## 1. Mission Statement

Ship more reliable agentic workflows for A3RO (market intelligence dashboard, trend
detection, trading ideas, multi-agent workflows), and reduce token spend through
architecture, not model swaps.

## 2. Starting Point (from repo audit, not self-report)

I pulled the actual state of `A3RO` on 2026-07-21 to ground this plan in reality
rather than assumptions:

- **Working on `main` directly.** 20 files modified, uncommitted, sitting on `main`
  with no feature branch. This is the live version of "no rollback path."
- **Two abandoned agent branches** (`jarvis/fix-lint-fix-4`, `jarvis/fix-tsc-fix-3`)
  with zero commits ahead of `main` — evidence of agents opening branches that never
  actually captured work, then going stale.
- **No test framework at all.** No jest/vitest/pytest, no `*.test.*` files anywhere
  in the repo.
- **No CI gate on push/PR.** The five GitHub workflows that exist
  (`daily_scan`, `bull-scan`, `bull-backfill`, `earnings-weekly`, `earnings-backfill`)
  are all scheduled cron jobs that commit data back to `main` — none of them run
  lint/typecheck/tests against changes before merge.
- **Stack:** Next.js 14 / React 18 / TypeScript frontend, Python backend
  (`module5-scan-pipeline`), Postgres via `pg`. Several standalone architecture docs
  (`bull-market-finder-unified-architecture.md`, `bagholder-trigger-trade-architecture.md`,
  `earnings-beat-tracker-architecture.md`) describing multi-module agent/pipeline designs.

This means the single highest-leverage fix isn't "learn multi-agent orchestration
theory" — it's closing the gap between "agent makes a change" and "Daniel can verify
and revert it in under a minute." Everything else compounds on top of that.

## 3. Clarifying Answers (from you)

| Question | Answer |
|---|---|
| Current architecture | Not specified — treating as informal multi-agent / ad hoc based on repo evidence (stray agent branches, unattended cron commits) |
| Where token spend concentrates | Not yet profiled — Week 2 includes a diagnostic pass before optimizing |
| "Ship without fear" means | No rollback path — git hygiene is the acute pain point |
| Time budget | ~2–3 hrs/week, few deep sessions (not daily micro-drills) |

## 4. Goals for the 4 Weeks

1. **Knowledge:** Understand *why* certain git/testing/harness patterns exist —
   not just the commands, but the failure modes they prevent.
2. **Skills:** Build muscle memory for branch-per-change, small reviewable diffs,
   fast revert, and a minimal CI gate — applied directly to A3RO, not toy repos.
3. **Wisdom:** Develop judgment for *when* an agent workflow needs a checkpoint,
   a smaller task decomposition, or a token budget — so architecture choices, not
   model upgrades, become your default lever.

## 5. Success Criteria (end of week 4)

- Every change to A3RO lands via a branch + PR, never a direct commit to `main`.
- Any agent-authored change can be reverted in under 2 minutes without asking "wait,
  what else did this touch?"
- At least one CI check (lint + typecheck, minimum) blocks bad merges automatically.
- You can point to one concrete before/after token-spend number for one A3RO workflow,
  with the architectural change that produced it named explicitly.
- The two stale `jarvis/*` branches are gone (merged, cherry-picked, or deleted with
  a written reason).

## 6. Non-Goals (explicitly out of scope this cycle)

- Swapping models to save tokens (that's the thing we're deliberately avoiding).
- Rewriting the trading/scoring logic itself — this is about the harness around it.
- Full test coverage of the app. Week 3 targets the highest-risk paths only.

---

## 7. Four-Week Curriculum

### Week 1 — Git Hygiene & Reversibility (Knowledge + Skills)
*Goal: never fear a commit again.*

**Knowledge**
- Commit as a unit of thought, not a unit of "agent finished a turn."
- The difference between `revert`, `reset`, and `checkout` — and why `revert` is
  the only one safe to use on shared/main history.
- Why small diffs are a reliability technique, not just a style preference (smaller
  blast radius, faster review, cheaper to re-run/re-prompt an agent against).

**Skills (exercises inside A3RO — see Lesson 1 below for full detail)**
1. Triage and land the current 20 uncommitted files as atomic, reviewable commits
   on a branch (not main).
2. Delete or resurrect the two stale `jarvis/*` branches with a documented reason.
3. Practice one deliberate `git revert` on a throwaway commit to build the reflex.
4. Adopt a branch-naming + commit-message convention for agent-authored work
   (e.g. `agent/<workflow>-<short-desc>`, commit trailer `Agent-Task: <id>`).

**Wisdom check-in:** After this week, write one paragraph on what "small enough to
revert confidently" means for an A3RO change (a scoring formula? a UI component? a
cron script?).

---

### Week 2 — Token Spend Diagnostics (Knowledge + Skills)
*Goal: know where the tokens go before touching architecture.*

**Knowledge**
- Where cost actually accumulates in agent loops: context re-injection, tool-result
  echoing, sub-agent handoff payloads, retries after failures.
- The difference between "expensive because the task is hard" and "expensive because
  the harness is wasteful."

**Skills**
1. Instrument one real A3RO workflow (pick the Bull Market Finder or Earnings Beat
   pipeline, since both have existing architecture docs) to log token/cost per step,
   not just per run.
2. Build a one-page table: step name → tokens in → tokens out → % of total.
3. Identify the single largest contributor and write down a hypothesis for why.

**Wisdom check-in:** Decide, with numbers in hand, whether the biggest cost driver
is a context problem, a retry problem, or a decomposition problem. Don't fix it yet —
Week 4 is for that.

---

### Week 3 — Testing Strategy for AFK Agents (Knowledge + Skills)
*Goal: catch regressions without demanding 100% coverage.*

**Knowledge**
- Risk-based test targeting: for a codebase with zero tests, where do you put the
  first 5 tests to get 80% of the safety?
- What "testing an agent workflow" means differently from testing normal code:
  determinism of outputs, golden-file / snapshot comparisons for data pipelines,
  and smoke tests for cron jobs that mutate data unattended.

**Skills**
1. Pick the highest-risk path in `module5-scan-pipeline` or the earnings backfill
   logic (something a cron job runs unattended and commits back to main) and write
   3–5 tests around it — focused on "does this still produce sane output," not
   full unit coverage.
2. Add a CI workflow that runs lint + typecheck + the new tests on every push/PR
   (closing the gap identified in the audit: none of the 5 existing workflows do this).
3. Intentionally break something small, push it, and watch the CI gate catch it.

**Wisdom check-in:** Write down your rule of thumb for "this AFK agent change needs
a test before merge" vs. "this one is safe to ship directly."

---

### Week 4 — Architecture for Reliability & Token Efficiency (Knowledge + Wisdom)
*Goal: turn Week 2's diagnosis into a structural fix.*

**Knowledge**
- Patterns that reduce token spend structurally: caching/memoizing expensive
  context, summarizing instead of re-passing full tool output, splitting a single
  large agent task into smaller checkpointed steps that can resume instead of
  re-running from scratch.
- Orchestrator/worker vs. pipeline vs. single-agent-with-tools — trade-offs for a
  system like A3RO with multiple independent trackers (Bull, Oil, Gold, Regime,
  Earnings).

**Skills**
1. Apply one concrete architectural change to the Week 2 workflow (e.g. cache a
   re-fetched dataset, checkpoint a multi-step scan so a failure mid-run doesn't
   restart from zero, trim a sub-agent's context to only what the next step needs).
2. Re-measure token spend on the same workflow and record the delta.
3. Write a one-page ADR (architecture decision record) for the change: what problem,
   what alternatives, what you chose, why.

**Wisdom check-in:** Revisit the Week 1 success criteria. Are you shipping without
fear yet? What's the next 4-week cycle's mission?

---

## 8. Weekly Cadence (given ~2–3 hrs/week)

- One ~90–120 min deep session per week working directly in A3RO.
- End each session by updating `learning_record.json` with what you did, what
  surprised you, and one open question for next time.
- No daily micro-drills — depth over frequency, per your stated preference.
