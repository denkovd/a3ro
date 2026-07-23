# Lesson 1 — Git Hygiene: Ship Without Fear

**Time:** ~90–120 min, one sitting. **Repo:** A3RO, live, re-checked 2026-07-21 (evening).

Updated from the version I wrote this morning — the repo has moved, and not in a
clean direction. Two new things happened since the audit:

1. A near-total line-ending flip touched **186 files** (34,611 insertions / 34,611
   deletions — an exact match, which is the signature of a mechanical rewrite, not
   real edits).
2. `mission.md`, `learning_record.json`, and the original `lesson_1_git_hygiene.md`
   got **committed directly to `main`** (commit `a513ce6`), followed by a commit
   literally titled `"troll"` (`5c3a6a0`) that added two lines to a log file.

Neither of these is a disaster, but both are exactly the failure modes this lesson
exists to prevent — so we're using them as the exercise instead of pretending they
didn't happen.

## Current state (verified just now)

```
On branch main, up to date with origin/main
186 files modified, all showing 100% line churn (CRLF/LF flip, not content changes)
1 untracked dir: .claude/
1 stale lock file present: .git/index.lock (0 bytes, from this session)
3 stale branches, 0 commits ahead of main: jarvis/fix-lint-fix-2, jarvis/fix-lint-fix-4, jarvis/fix-tsc-fix-3
Recent main history includes: a513ce6 "chore: add dev logs, learning docs..." and 5c3a6a0 "troll"
```

## Exercise 0 — Stop and check the lock file first (5 min)

Before touching anything else: `.git/index.lock` exists in your working copy right
now. Git creates this file while a command is running and deletes it on exit — if
one is sitting there afterward, it means either a git process is still running, or
one crashed/got killed mid-operation and left the lock behind.

```bash
# On your machine, check for a running git process before deleting anything:
ps aux | grep git        # macOS/Linux
# or Task Manager on Windows — look for git.exe

# Only if nothing is running:
rm .git/index.lock
```

**Why this matters:** deleting an index.lock while git is actually mid-write can
corrupt the index. This is a small, concrete instance of a bigger rule you'll use
constantly with agents: before you clean up something that looks stale, confirm
nothing is still using it.

## Exercise 1 — Diagnose the 186-file line-ending flip (20 min)

This is today's real lesson, not a hypothetical. Confirm the diagnosis:

```bash
git diff --stat | tail -3
# 186 files changed, 34611 insertions(+), 34611 deletions(-)
# equal insertions/deletions across the whole repo = every line "changed"
# but nothing meaningfully did

file app/page.tsx
# app/page.tsx: ... with CRLF line terminators

git config --get core.autocrlf
git config --get core.eol
cat .gitattributes 2>&1   # currently: no such file
```

There's no `.gitattributes` in this repo, and no `core.autocrlf`/`core.eol` set —
so line endings are whatever your editor or OS last wrote, and git has no
instruction to normalize them. That's how a whole tree can flip CRLF↔LF in one
sitting and produce a 34,611-line diff that says nothing real.

**Fix it at the source, don't just discard the diff:**

```bash
cat > .gitattributes << 'EOF'
* text=auto eol=lf
EOF

git add .gitattributes
git commit -m "chore(git): normalize line endings to LF via .gitattributes

Repo had no line-ending policy, which let a single local checkout flip
186 files (CRLF<->LF) into a 34k-line no-op diff. This pins LF as the
committed convention regardless of editor/OS."

# Renormalize the whole tree against the new rule:
git add --renormalize .
git status   # should now show either nothing, or only real content diffs
```

**Wisdom check:** this is the Week-1 argument for small diffs made concrete. A
186-file diff with zero real content is *harder* to review than a 3-line real bug
fix, purely because of size — and it's exactly the kind of noise that would bury
an agent-authored regression if one were mixed in. A `.gitattributes` file is a
five-minute structural fix that prevents this exact category of problem from ever
recurring, for you or for any agent working in this repo.

## Exercise 2 — Read the two commits that skipped the branch step (10 min)

```bash
git show --stat a513ce6
git show --stat 5c3a6a0
```

`a513ce6` added the learning docs, dev logs, and reference images — landed
straight on `main`, no branch, no PR. `5c3a6a0` ("troll") added two lines to
`.dev-stdout.log` with a commit message that tells you nothing about what changed
or why.

Don't beat yourself up about this — just name it accurately, because that's the
whole point of the habit: **these are exactly the two things Exercise 2 and
Exercise 3 below exist to prevent, and now you have a real example of what it
costs.** Neither commit is harmful. But if `a513ce6` had *also* contained a real
bug, you'd have no branch to isolate it on and no way to revert just that piece
without also losing the docs.

Write one line in `learning_record.json` (week 1 notes): what made branching feel
skippable in the moment? Time pressure? Not having the reflex yet? Name the actual
reason — that's the wisdom layer.

## Exercise 3 — Branch first, always, starting now (5 min)

```bash
git checkout -b chore/normalize-line-endings-2026-07-21
```

Reflex to build: *if I'm about to type `git commit` and `git branch --show-current`
says `main`, stop.* This applies to every remaining exercise below.

## Exercise 4 — Practice reverting on purpose (15 min)

Build the muscle memory on a throwaway commit before you need it for real:

```bash
echo "test" >> testfile.tmp
git add testfile.tmp
git commit -m "test: throwaway commit for revert practice"
git revert HEAD --no-edit
git log --oneline -3
```

Confirm you understand: `revert` created a *new* commit undoing the change, rather
than rewriting history — the only safe option once something is pushed or shared.
`reset --hard` on shared history is how you get agents (or yourself) fighting
divergent branches.

Clean up before moving on:

```bash
git reset --hard HEAD~2   # safe here ONLY because this never left your local branch
```

## Exercise 5 — Resolve all three stale branches (15 min)

There are now three, not two — `jarvis/fix-lint-fix-2` joined `fix-lint-fix-4` and
`fix-tsc-fix-3`, all still at zero commits ahead of `main`:

```bash
git log --oneline main..jarvis/fix-lint-fix-2
git log --oneline main..jarvis/fix-lint-fix-4
git log --oneline main..jarvis/fix-tsc-fix-3
```

A third one appearing since this morning, with the identical pattern, is itself a
signal: something in your agent workflow habitually opens a `jarvis/fix-*` branch
and then never lands work on it. That's worth a real hypothesis, not just cleanup:

```bash
git branch -d jarvis/fix-lint-fix-2
git branch -d jarvis/fix-lint-fix-4
git branch -d jarvis/fix-tsc-fix-3
```

Write your hypothesis in `learning_record.json` — this is direct input to Week 2
(is this pattern burning tokens on abandoned branches?) and Week 4 (does the
harness need a step that either lands or explicitly discards a branch before the
agent session ends?).

## Exercise 6 — Land the real work, commit by cluster (20–30 min)

Once `git status` is clean of line-ending noise (Exercise 1), re-check what's left.
Stage and commit any genuine remaining changes by logical cluster, same convention
as before:

```
<type>(<scope>): <what changed and why>

Agent-Task: <short id or description of the prompt/session that produced this>
```

**Rule of thumb for cluster size:** if you can't summarize the diff in one commit
sentence without using "and" more than once, split it.

## Exercise 7 — Push and open a PR against yourself (10 min)

```bash
git push -u origin chore/normalize-line-endings-2026-07-21
```

Open a PR even as sole reviewer. It's not review theater — it forces every future
change through a diff view before touching `main`, and it's the natural place to
attach the CI gate you'll build in Week 3.

## Done-when

- [ ] `.git/index.lock` confirmed safe and removed
- [ ] `.gitattributes` committed, tree renormalized, no more phantom line-ending diffs
- [ ] You've named, in writing, why the two direct-to-main commits happened
- [ ] One deliberate `git revert` practiced, and you can explain why it differs from `reset`
- [ ] All three `jarvis/*` branches resolved, with a hypothesis (not just "deleted") logged
- [ ] Any real remaining changes committed in scoped clusters, on a branch, not `main`
- [ ] A PR is open for this branch
- [ ] `learning_record.json` week 1 entry updated: what happened, what surprised you,
      one open question

## Carry into Week 2

You now have two concrete, real data points for the token-spend diagnostic:
a 186-file no-op diff (which, if fed back into an agent's context anywhere, is
pure waste) and a recurring pattern of abandoned `jarvis/fix-*` branches. Both are
candidates for "where does the harness leak tokens" before you even open a
profiler next week.
