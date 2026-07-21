# Lesson 1 — Git Hygiene: Ship Without Fear

**Time:** ~90–120 min, one sitting. **Repo:** A3RO, live, as of 2026-07-21.

You currently have real, uncommitted work sitting directly on `main` — this lesson
uses that actual state as the exercise instead of a toy example.

## Current state (verified today)

```
On branch main
23 modified files, 0 staged, working directly on main
2 stale branches with 0 commits ahead of main: jarvis/fix-lint-fix-4, jarvis/fix-tsc-fix-3
```

Modified files fall into rough clusters:

- **CI workflows (5):** `.github/workflows/{bull-backfill,bull-scan,daily_scan,earnings-backfill,earnings-weekly}.yml`
- **Docs (2):** `DECISIONS.md`, `REVIEW.md`
- **`.gitignore`** — worth checking: this diff may be whitespace/line-ending only
- **Bull Market Finder UI (2):** `app/Projects/Bull-Market-Finder/{page,view}.tsx`
- **Oil Tracker (1):** `app/Projects/Oil-Tracker/view.tsx`
- **Regime Finder + Regime Shift (4):** `app/Projects/Regime-{Finder,Shift}/{page,view}.tsx`
- **Thesis Lab (2):** `app/Projects/Thesis-Lab/{page,view}.tsx`
- **API routes (6):** `app/api/bull/{latest,transitions}/route.ts`, `app/api/cron/{earnings,ingest}/route.ts`,
  `app/api/gold/latest/route.ts`, `app/api/leaderboard/earnings-beats/{db,engine}.ts`

## Exercise 1 — Read before you stage (15 min)

For each cluster above, run:

```bash
git diff -- <files in cluster>
```

Write one line per cluster answering: *is this one coherent change, or is it
actually two unrelated things bundled together?* (This is the single most useful
git habit — reading the diff before staging catches accidental scope creep before
it becomes a commit you can't cleanly revert.)

Pay special attention to `.gitignore` — if `git diff .gitignore` shows only
whitespace/line-ending changes, decide now whether that's worth its own commit or
should be dropped (`git checkout -- .gitignore`).

## Exercise 2 — Branch first, always (10 min)

You're on `main` with uncommitted work. Before anything else:

```bash
git checkout -b chore/land-pending-work-2026-07-21
```

This costs nothing and immediately makes every commit you're about to make
revertable/droppable without touching `main`. Make this reflex automatic: *if I'm
about to type `git commit` and `git branch --show-current` says `main`, stop.*

## Exercise 3 — Stage and commit by cluster, not by "everything" (30–40 min)

For each cluster, stage only those files and write a commit message that describes
the *why*, not just the *what*:

```bash
git add .github/workflows/
git commit -m "ci(workflows): <describe the actual change>"

git add app/Projects/Bull-Market-Finder/
git commit -m "feat(bull): <describe the actual change>"

# ... repeat per cluster
```

Adopt this convention going forward for agent-authored work specifically:

```
<type>(<scope>): <what changed and why>

Agent-Task: <short id or description of the prompt/session that produced this>
```

The `Agent-Task` trailer matters more than it looks — six months from now, `git log
--grep="Agent-Task"` is how you'll find every change an agent made unattended,
which is exactly what you need when auditing for the AFK-agent testing work in
Week 3.

**Rule of thumb for cluster size:** if you can't summarize the diff in one commit
message sentence without using "and" more than once, split it.

## Exercise 4 — Practice reverting on purpose (15 min)

Before you push anything real, build the muscle memory on a throwaway commit:

```bash
echo "test" >> testfile.tmp
git add testfile.tmp
git commit -m "test: throwaway commit for revert practice"
git revert HEAD --no-edit
git log --oneline -3
```

Confirm you understand: `revert` created a *new* commit that undoes the change,
rather than rewriting history. That's why it's the only safe option once something
is pushed or shared — `reset --hard` on shared history is how you get agents (or
yourself) fighting divergent branches.

Clean up the practice commits before moving on:

```bash
git reset --hard HEAD~2   # safe here ONLY because this never left your local branch
```

## Exercise 5 — Resolve the two stale branches (15 min)

```bash
git log --oneline main..jarvis/fix-lint-fix-4
git log --oneline main..jarvis/fix-tsc-fix-3
```

Both currently show zero commits ahead of `main` — meaning whatever those agent
sessions did either never got committed, or got committed and then merged/rebased
away already. Confirm which, then:

```bash
git branch -d jarvis/fix-lint-fix-4
git branch -d jarvis/fix-tsc-fix-3
```

Write one sentence in `learning_record.json` (week 1 notes) about *why* these went
stale — was it an agent session that ran out of context mid-task? A fix that got
hand-applied elsewhere and the branch just never got cleaned up? This is the
beginning of your wisdom layer: recognizing the harness failure mode that produces
orphaned branches, so Week 4's architecture fix can address it directly.

## Exercise 6 — Push and open a PR against yourself (10 min)

```bash
git push -u origin chore/land-pending-work-2026-07-21
```

Open a PR even though you're the only reviewer. The point isn't review theater —
it's forcing every future change (yours or an agent's) through a diff view before
it touches `main`. This PR is also the natural place to bolt on the CI gate you'll
build in Week 3.

## Done-when

- [ ] `main` has no uncommitted changes
- [ ] All 23 files are committed across clearly-scoped commits on a feature branch
- [ ] You've done one deliberate `git revert` and can explain why it's different
      from `reset`
- [ ] Both `jarvis/*` branches are gone, with a one-line reason logged
- [ ] A PR is open for this branch
- [ ] `learning_record.json` week 1 entry updated: what you did, what surprised
      you, one open question

## Carry into Week 2

Note which of these 23 files were touched by an agent session vs. by hand — you'll
want that distinction when you start instrumenting token spend per workflow next
week, since agent-touched files are where the harness costs actually live.
