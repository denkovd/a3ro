# Trends Finder — module plan

Planning document, pre-code. Companion to `docs/RULES.md` (source reliability
contract) and the `score_snapshots` posture ("the score never hides its
inputs"). Target universe v1: **investable items** — US equities, liquid ETFs,
top crypto assets, and a curated macro-topic list. Everything else (brands,
memes, people, products) is a later universe expansion, not an MVP concern.

Verified as of 2026-07-14: X API free tier discontinued (pay-per-use
$0.005/read, 2M reads/mo cap; Enterprise ~$42k/mo). Reddit Data API free at
100 QPM per OAuth client for non-commercial use; commercial use requires an
approved paid agreement (~$0.24/1k calls, ~$12k/yr entry). StockTwits closed
to new developer registrations. Google Trends official API is in
application-gated alpha. Bluesky firehose/Jetstream is free, no auth.

---

## 1. Executive architecture

Trends Finder is a **batch, multi-stage ranking pipeline** on the existing
A3RO rails: scheduled runs → tsx scripts → Postgres → Next.js API routes →
project page. No new infrastructure class (no Kafka, no ClickHouse, no vector
DB, no streaming). A 30-minute batch cycle is fully sufficient — trend
detection needs hours-scale latency, not seconds; anything faster is cost
without benefit at MVP.

Eight stages, each independently testable, each writing to its own tables:

```
[1 Ingest] → [2 Normalize/Dedup] → [3 Mention extraction] → [4 Rollup]
      → [5 Baselines/Stats] → [6 Composite scoring] → [7 Surface ranking]
      → [8 Snapshot & serve]
```

Design principles, in priority order:

1. **Closed universe first.** Resolution against a known registry of ~2,500
   canonical entities, not open-vocabulary discovery. This one decision makes
   entity resolution ~95% deterministic and cheap, and it is what makes the
   MVP realistic.
2. **Everything is measured against its own baseline.** Raw counts are never
   ranked. "Rising" means deviation from the entity's own per-source
   historical rate. This kills the mega-cap-always-on-top failure mode.
3. **Breadth is the anti-manipulation backbone.** Pumping one subreddit is
   cheap; moving news domains + Reddit + HN + Wikipedia pageviews
   simultaneously is expensive. Cross-source confirmation is a first-class
   score component, not a display nicety.
4. **Raw data is immutable from day 1.** Every backtest, recalibration, and
   eval depends on being able to replay history with as-of discipline. This
   is the single highest-leverage architectural choice in the plan.
5. **LLMs only at the edges.** Disambiguation of collision-prone aliases,
   sampled sentiment, and "why trending" blurbs — batched, cached,
   budget-capped Haiku. Zero premium-model calls in the hot path. The
   pipeline must produce correct rankings with the LLM budget set to zero
   (degraded: fewer resolved ambiguous mentions, no sentiment).
6. **Every rank is explainable.** Snapshots store all score components
   (jsonb, same posture as `score_snapshots.components`) plus evidence
   references. The UI can always answer "why is this here."

Placement in repo: `backend/src/trends/` (sources, resolve, stats, engine,
surfaces), migrations `014+`, scripts `run-trends-*.ts`, workflow
`trends-scan.yml`, normative doc `docs/TRENDS_RULES.md`, frontend
`app/Projects/Trends-Finder/` + `app/api/trends/*`. Source adapters implement
the existing descriptor contract (error-kind mapping, rate gates, circuit
breaker, `source_health`) from RULES.md §2 — that machinery is reused, not
rebuilt.

## 2. MVP scope

**In:**

- Universe: ~1,500–2,000 US equities (large + liquid mid caps + a curated
  meme-prone small-cap list), ~50 ETFs, top ~400 coins (CoinGecko ranked),
  ~50 macro topics ("rate cut", "tariffs", "oil supply", …). One registry
  table + alias table, seeded from SEC `company_tickers.json`, exchange
  lists, and CoinGecko ids; curated once with offline LLM assist.
- Sources (5 at launch, all free):
  - **GDELT DOC 2.0** — global news metadata, 15-min refresh. Backbone.
    Known-messy: duplicates, syndication, non-English noise. Handled in
    stage 2, and worth it — nothing else free has this news breadth.
  - **Curated RSS** (~80–150 feeds: finance/crypto/tech press, PR wires).
    Backbone. Redundant with GDELT by design — RSS is the reliability hedge
    when GDELT hiccups, and gives full headlines/summaries where GDELT gives
    metadata.
  - **Reddit OAuth free tier** — ~40–60 finance/crypto/sector subreddits,
    polling `/new` + `/hot` posts. Comments are NOT ingested at MVP; instead
    `num_comments` deltas per post are tracked as an engagement-velocity
    signal (near-zero quota cost, captures most of the thread-heat signal).
    Supplement. **ToS flag below (§14).**
  - **Hacker News (Algolia API)** — free, stable, high-quality tech/AI
    signal that leads equity narratives. Supplement.
  - **Wikipedia pageviews REST API** — daily per-article views for every
    universe entity with a page. Free, stable, and the best free proxy for
    mainstream search interest. Daily grain: used for breadth/persistence
    confirmation, not hourly velocity.
  - Plus **CoinGecko free tier** for the crypto universe refresh and its
    `/search/trending` endpoint as a weak confirmation signal.
- Two scoring windows: 24h and 7d, on hourly UTC event-time buckets.
- All five surfaces, but **Early Breakout ships flagged "speculative"** and
  possibly restricted to mid-cap+ equities and top-200 coins (free-source
  mention density for small caps is too thin to trust — see §14).
- Scheduler: GitHub Actions cron every 30 min (existing platform pattern).
  Bucketing is event-time, so Actions' cron drift (5–15 min is normal) and
  missed runs are harmless — a late run fills the same buckets.
- 3–4 week burn-in collecting baselines before any surface is trusted;
  internal JSON API first, UI after burn-in.

**Explicitly out of MVP:**

- X/Twitter (no free tier; $0.005/read makes broad scanning unaffordable),
  StockTwits (registrations closed), Google Trends (alpha-gated — apply on
  day 1, integrate only if granted), Bluesky (cheap but low finance density —
  phase 4 add), YouTube (phase 4), blogs/forums.
- Open-vocabulary topic discovery (memes, unnamed narratives).
- Sub-30-minute latency, comment-level Reddit ingestion, per-mention
  sentiment on everything, alerting/notifications, non-English sources.

## 3. Scale-up scope

Triggers and additions, in the order they'll actually be needed:

1. **Scheduler off Actions** (trigger: >2 sources needing <30-min polls, or
   Actions minutes cost on a private repo — 48 runs/day × ~4 min ≈ 5,800
   min/mo, past the 2,000 free). Move ingestion to one small always-on
   worker (Fly.io/VPS); keep Postgres and the serve path unchanged.
2. **Paid social reads, narrowly** (trigger: validated demand for
   faster-than-news equity chatter). X pay-per-use with a hard monthly read
   budget aimed only at cashtag search for current top-100 entities —
   confirmation for things already trending, never discovery (discovery at
   $5/1k reads doesn't pencil). Reddit commercial license decision belongs
   here too (§14).
3. **Open-vocabulary discovery lane.** N-gram/phrase burst detection over
   normalized text → candidate topics → offline LLM canonicalization →
   promotion into the registry as `topic`/`meme` entities. This is how the
   universe expands to brands/memes without ever doing open-ended NER in the
   hot path. Candidates are quarantined until a human (or premium-model
   audit) approves promotion.
4. **Storage split** (trigger: hourly rollup queries degrade; roughly >20M
   mentions or >2GB hot rollups — years away at MVP volume). Raw payloads to
   object storage, rollups to TimescaleDB/ClickHouse. Schemas below are
   designed so this is a data move, not a redesign.
5. **Universe expansion**: international equities, brands, people, products
   — each is a new `entity_type` + alias seeds + maybe a source pack; the
   pipeline itself doesn't change.
6. **Embedding-based story clustering** replacing SimHash when near-dup
   collapse misses paraphrased syndication at higher news volumes.
7. **Day-of-week/hour-of-day seasonal baselines** (weekend vs market-hours
   rhythms) once enough history exists — v1 uses a weekend multiplier like
   RULES.md §1's weekend staleness relaxation.

## 4. Pipeline stages

Each stage: input → output → failure posture. Idempotent by natural key
throughout; any stage can be re-run for a time range without duplication.

**S1 Ingest** (per-source adapters, every 30 min)
In: source APIs. Out: `trend_raw_items` (append-only, upsert on
`(source_id, external_id)`). Adapters implement the RULES.md descriptor
contract: error-kind mapping, rate gate, circuit breaker via `source_health`,
staleness tiers. A source failing means its items are absent — never blocks
other sources; scoring degrades gracefully (breadth denominators use only
sources fresh that cycle).

**S2 Normalize + dedup**
In: new raw items. Out: normalized text (NFKC, casefold copy retained,
URL/entity-preserving), language filter (English-only v1, cld3-style
detector), exact dedup by `content_hash`, near-dup by SimHash (64-bit,
Hamming ≤ 3 within a 72h window) → assign `story_cluster_id`. Reddit
crossposts collapse by target URL. Syndicated wire copy collapses to one
cluster; the cluster's `distinct_domains` count becomes a feature (§9).

**S3 Mention extraction** (the entity-resolution stage, §6)
In: normalized items. Out: `trend_mentions` rows with `entity_id`,
`confidence`, `match_method`. Deterministic dictionary pass (Aho-Corasick
over the alias table) + per-alias match policies; ambiguous survivors are
queued for batched Haiku adjudication with a per-cycle budget; unresolved
stays unresolved (counted, not guessed).

**S4 Rollup**
In: mentions. Out: `entity_metrics_hourly` — per (entity, source_class,
hour): mention count, weighted count (confidence- and dedup-weighted),
unique authors, story clusters, distinct domains, engagement deltas
(`num_comments`, scores), sentiment tallies (when enabled). Pure SQL
aggregation, re-runnable per hour.

**S5 Baselines + statistics**
In: hourly rollups. Out: `entity_baselines` — per (entity, source_class,
window): EWMA mean and variance of the bucket rate (half-life 7d, 28d
lookback, current window excluded), with additive smoothing and a variance
floor (§7). Then per-entity stats this cycle: velocity z, acceleration,
breadth, persistence — written into the snapshot components.

**S6 Composite scoring**
In: stats + quality priors + spam signals. Out: component vector and Heat
per (entity, window). Deterministic math only (§7).

**S7 Surface ranking**
In: scored entities. Out: per-surface ranked lists with eligibility flags
(§8). Five surfaces are five functions over the same component vector —
no surface has its own pipeline.

**S8 Snapshot + serve**
Out: `trend_snapshots` upserted on `(run_ts, entity_id, window)` — the read
model for the API and the durable history. API routes only ever read
snapshots + rollups; nothing is computed at request time (same posture as
`/api/oil/scores`).

Offline/async lanes (not in the 30-min cycle): universe refresh (weekly),
alias curation, Haiku sentiment sampling (hourly batch over top entities),
blurb generation (on story-cluster change for surface-visible entities),
eval jobs (§11).

## 5. Data schemas

Postgres 14+, plain SQL migrations in the house style. Proposed split:
`014_trends_universe.sql`, `015_trends_ingest.sql`, `016_trends_scores.sql`.

```sql
-- 1) Raw source item — append-only, immutable. The replay substrate.
create table trend_raw_items (
  id            bigint generated always as identity primary key,
  source_id     text not null,            -- 'gdelt' | 'rss' | 'reddit' | 'hn' | 'wiki_pv' | ...
  source_class  text not null,            -- 'news' | 'social' | 'forum' | 'video' | 'reference'
  external_id   text not null,            -- source-native id (url hash, reddit fullname, hn id)
  published_at  timestamptz not null,     -- EVENT time; all bucketing keys off this
  fetched_at    timestamptz not null default now(),
  url           text,
  domain        text,
  author_hash   text,                     -- salted hash; never store raw handles we don't need
  title         text,
  body_excerpt  text,                     -- capped (~2KB); full payload below
  payload       jsonb not null,           -- verbatim source record
  content_hash  bytea not null,           -- sha256 of normalized title+body
  simhash       bigint,
  story_cluster_id bigint,                -- assigned in S2
  lang          text,
  engagement    jsonb,                    -- {score, num_comments, views} snapshot at fetch
  unique (source_id, external_id)
);
-- monthly partitions; payload prunable after 60d if space ever matters (it won't soon)

-- 2) Normalized mention — one row per (item, entity) hit.
create table trend_mentions (
  id            bigint generated always as identity primary key,
  raw_item_id   bigint not null references trend_raw_items(id),
  entity_id     bigint not null references trend_entities(id),
  alias_id      bigint references trend_aliases(id),
  span          int4range,                -- char offsets in normalized text
  match_method  text not null,            -- 'cashtag'|'exact_safe'|'context_rule'|'llm'|'manual'
  confidence    real not null,            -- 0..1; deterministic methods emit 1.0 / 0.9
  published_at  timestamptz not null,     -- denormalized from raw item
  source_id     text not null,
  source_class  text not null,
  author_hash   text,
  story_cluster_id bigint,
  dedup_weight  real not null default 1.0,-- 1/cluster_size share, see §9
  unique (raw_item_id, entity_id)
);

-- 3) Canonical entity + aliases (separate table: aliases carry policy).
create table trend_entities (
  id            bigint generated always as identity primary key,
  entity_type   text not null,            -- 'equity'|'etf'|'crypto'|'topic' (later: 'brand'|'person'|'meme'|'sector')
  canonical_name text not null,
  symbol        text,                     -- ticker / coin symbol where applicable
  external_ids  jsonb not null default '{}', -- {cik, figi, coingecko_id, wikipedia_title, exchange}
  meta          jsonb not null default '{}', -- {sector, market_cap_bucket, listed_at}
  status        text not null default 'active', -- 'active'|'quarantined'|'retired'
  created_at    timestamptz not null default now(),
  unique (entity_type, canonical_name)
);

create table trend_aliases (
  id            bigint generated always as identity primary key,
  entity_id     bigint not null references trend_entities(id),
  alias         text not null,            -- normalized form
  alias_kind    text not null,            -- 'ticker'|'cashtag'|'name'|'abbrev'|'hashtag'|'misspelling'
  match_policy  text not null,            -- 'safe' | 'context_required' | 'cashtag_only' | 'blocked'
  min_confidence real not null default 1.0,
  source        text not null,            -- 'sec'|'coingecko'|'curated'|'llm_proposed'
  approved      boolean not null default false, -- llm_proposed requires approval before matching
  unique (alias, entity_id)
);

-- 4) Trend score snapshot — the read model. One row per run/entity/window.
create table trend_snapshots (
  run_ts        timestamptz not null,
  entity_id     bigint not null references trend_entities(id),
  window        text not null,            -- '24h' | '7d'
  heat          real,                     -- 0..100, null when ineligible
  velocity_z    real, accel real, breadth real, persistence real,
  quality       real, spam_penalty real,
  sentiment_skew real,                    -- -1..1, null until sentiment lane on
  eligible      boolean not null,
  surface_ranks jsonb not null default '{}',  -- {"most_climbing": 4, "overall_heat": 12, ...}
  components    jsonb not null,           -- full explanation: per-source z, counts, floors hit,
                                          -- spam evidence, weights used. Never hides its inputs.
  evidence_ids  bigint[] not null default '{}', -- top raw_item ids backing this rank
  primary key (run_ts, entity_id, window)
);

-- 5) Historical time series — compact hourly rollup snapshots are computed from.
create table entity_metrics_hourly (
  entity_id     bigint not null references trend_entities(id),
  bucket_ts     timestamptz not null,     -- hour, UTC, event-time
  source_class  text not null,
  mention_ct    int not null default 0,
  weighted_ct   real not null default 0,  -- confidence × dedup_weight sum
  uniq_authors  int not null default 0,
  story_ct      int not null default 0,   -- distinct story clusters
  domain_ct     int not null default 0,
  engagement    real not null default 0,  -- comment/score deltas attributable to bucket
  sent_pos int, sent_neg int, sent_neu int,
  spam_flagged_ct int not null default 0,
  primary key (entity_id, bucket_ts, source_class)
);
-- retention: hourly 90d hot, then rolled to entity_metrics_daily (same shape, date grain) kept forever

create table entity_baselines (
  entity_id     bigint not null,
  source_class  text not null,
  window        text not null,
  ewma_mean     real not null,
  ewma_var      real not null,
  n_obs         int not null,
  computed_at   timestamptz not null,
  primary key (entity_id, source_class, window)
);
```

Volume sanity check: GDELT-filtered + RSS + 50 subreddits + HN ≈ 30–80k raw
items/day → ~2–7M rows/90d with mentions. Comfortably Postgres territory;
the ClickHouse conversation is a scale-up trigger, not an MVP design input.

## 6. Entity resolution design

The cost story: a closed universe turns ER from an NLP problem into a
dictionary problem with a small, bounded NLP escape hatch.

**Tier 0 — registry + alias compilation (offline, weekly).**
Seeds: SEC `company_tickers.json` (tickers, CIK, official names), exchange
listings, CoinGecko top-N (ids, symbols, names), curated macro-topic keyword
sets. An offline LLM-assisted pass proposes extra aliases (colloquial names
— "Google" for GOOGL, "bitcoin"/"btc", common misspellings, hashtag forms);
every proposed alias lands `approved = false` and a human (or premium-model
audit with human spot-check) approves before it can match. The compiled
output is one Aho-Corasick automaton rebuilt on registry change.

**Tier 1 — deterministic matching (in-pipeline, ~95%+ of mentions).**
Per-alias `match_policy` is the collision-control mechanism:

- `safe`: unique, non-word aliases ("nvidia", "ethereum", "berkshire") —
  match case-insensitively anywhere. confidence 1.0.
- `cashtag_only`: the ~200 tickers that are English words or dangerous
  fragments (ALL, IT, ON, SO, A, DD, ARE, FOR, EAT…) — match only as `$TICK`
  or exact uppercase token inside a finance-context source (a Reddit
  finance sub, a finance RSS feed). This single policy removes the worst
  false-positive class in ticker matching.
- `context_required`: ambiguous names ("Apple", "Oracle", "Shell") — match
  only when a context token from the entity's context set (ticker, sector
  word, "stock/shares/earnings", product names) appears within ±150 chars.
  Deterministic rule, confidence 0.9.
- `blocked`: known-bad aliases kept as tombstones so curation doesn't
  re-propose them.

**Tier 2 — LLM adjudication (budgeted escape hatch).**
Only items where Tier 1 produced a *contested* result (two entities matched
overlapping spans, or a `context_required` alias fired without context but
in a high-signal source) are queued. Batched to Haiku (~30 snippets/call),
answer is entity-id-or-none. Two cost controls: (a) a per-cycle cap
(~2,000 adjudications; overflow waits — trends that matter re-occur), and
(b) a decision cache keyed on (alias, context-fingerprint = hashed
surrounding tokens), so repeated phrasings — which is what trends *are* —
hit the cache. Expected steady state: a few hundred fresh calls/day.
Ballpark cost at Haiku pricing: cents-to-a-few-dollars per day. If the LLM
budget is zero, these mentions stay unresolved and are counted in an
`unresolved_rate` metric — the pipeline degrades, never blocks.

**Tier 3 — feedback loop (offline, weekly).**
Top unresolved n-grams and top cache-miss aliases get reviewed; outcomes
become new aliases or new `blocked` tombstones. This is also where the
scale-up discovery lane (§3.3) plugs in later.

What this deliberately does not do: open NER, embeddings at match time,
fuzzy string matching in the hot path (Levenshtein against 2,500 entities ×
80k items/day is wasted compute — misspellings enter as curated aliases when
they actually occur).

## 7. Scoring framework

All statistics are computed per (entity, source_class), then combined.
Counts are `weighted_ct` (confidence × dedup weight) — spam and syndication
controls (§9) act *before* scoring, penalties act *at* scoring.

**Base rate machinery.** For window W ∈ {24h, 7d}: current rate
`x = Σ weighted_ct` over W. Baseline: EWMA mean μ and variance σ² of the
same-width window over the trailing 28d (half-life 7d), current window
excluded. Two guards, both essential:

- additive smoothing: `x' = x + α`, `μ' = μ + α` with α ≈ 2. Kills the
  "0→4 mentions = infinite spike" garbage that plagues naive trending.
- variance floor: `σ ≥ max(σ_min, 0.35·μ')`. Low-history entities can't
  produce astronomical z from tiny σ.

**Components** (each computed, then percentile-mapped to [0,1] across all
active entities in the same window and entity_type — percentile mapping
makes weights meaningful and robust to fat tails):

- **V, velocity**: `z_v = (x' − μ') / σ`, aggregated across source classes
  by quality-weighted mean. "How far above its own normal is it now."
- **A, acceleration**: slope of hourly velocity z over the last 12h (24h
  window) / daily slope (7d window). Distinguishes "still building" from
  "peaked." Second-derivative-of-attention, first-derivative-of-z.
- **B, breadth**: `(# source classes with own z_v > 1) / (# source classes
  fresh this cycle and applicable to the entity_type)`, blended with news
  domain diversity (distinct_domains / story_ct). Denominator uses only
  fresh sources so a GDELT outage doesn't tank everyone's breadth.
- **P, persistence**: share of the last 24 hourly buckets (resp. 7 daily)
  with z > 0.5. Separates sustained attention from a single spike-and-die.
- **Q, quality** ∈ [0.5, 1]: weighted average of static source-class priors
  (news 1.0, HN 0.9, wiki 0.85, Reddit 0.7, later Bluesky 0.6) weighted by
  each class's contribution to x. A multiplier, not an additive term.
- **S, spam penalty** ∈ [0, 0.6]: max of the §9 detector outputs, capped so
  a false spam flag can dampen but never zero a real trend.

**Composite:**

```
Heat = 100 · Q · (1 − S) · (0.35·V + 0.20·A + 0.30·B + 0.15·P)
```

Rationale for the shape: V and B carry the most weight because "rising" (V)
that is "confirmed" (B) is the product's core claim; A rewards catching
things early; P tempers one-bucket wonders. Q and S are **multiplicative
gates** deliberately — garbage must not be able to buy rank with raw
velocity, which is exactly what an additive spam term would allow. Weights
are v1 priors; §11's eval loop owns them thereafter (stored in `components`
per snapshot so historical scores remain interpretable after retuning).

**Sentiment skew** = (pos − neg)/(pos + neg + neu) over a Haiku-sampled
subset (top ~100 entities, ≤200 mentions/entity/day; finance slang breaks
lexicons, so no lexicon fallback — null until sampled). It is **reported,
not weighted into Heat**: a scandal is as much a trend as a rally, and
sentiment direction is a display/filter dimension, not trendiness. The spec
lists it under scoring; keeping it out of the composite is a deliberate
disagreement, revisitable if eval shows sentiment-weighted ranking predicts
attention continuation better.

**Eligibility floor** (pre-ranking, not score): ≥ 8 weighted mentions in
24h (≥ 3 for the Early Breakout lane) across ≥ 2 story clusters. Below
floor → `eligible = false`, snapshot still written (the history matters).

## 8. Ranking definitions

Five surfaces = five orderings + eligibility predicates over one component
vector. All spam/quality gating is already inside Heat and the components.

| Surface | Eligibility (beyond floor) | Rank key |
|---|---|---|
| **Most Climbing** | S < 0.5 | `V · (1−S) · Q`, 24h window |
| **Overall Heat** | — | `Heat`, 24h (7d toggle) |
| **Cross-Platform Confirmation** | ≥ 3 source classes each with own z > 1 | `B`, tiebreak `Heat` |
| **Early Breakout** | trailing-28d μ below dormancy threshold; z > 2 in ≥ 2 consecutive buckets; ≥ 2 source classes; ≥ 3 weighted mentions | `A`, tiebreak `V` — badged *speculative* |
| **Fading Fast** | Heat percentile ≥ 80 at any snapshot in last 72h; now z_v < −0.5 with negative 6h slope | steepest 24h Heat drawdown |

Notes: Most Climbing tolerates single-source spikes (that's its job) but
not spam; Confirmation is the premium "this is real" list and should be the
flagship; Early Breakout is the highest-false-positive surface by
construction — it gets the strictest persistence requirement, the loudest
labeling, and (per §14) possibly a restricted universe at launch; Fading
Fast requires *prior* heat so it lists genuine decays, not permanently-quiet
entities drifting down.

Rank-stability control on all surfaces: an entity leaves a surface only
after failing its predicate for 2 consecutive snapshots (hysteresis), and
`delta_rank` vs. the previous snapshot ships in the API so the UI shows
movement instead of jitter.

## 9. Anti-spam / anti-noise controls

Layered, cheapest first. Each control writes its evidence into
`components.spam` so a penalized rank is auditable.

**Layer 1 — structural dedup (S2, removes the biggest noise class):**

- Exact dup: `content_hash` → one item.
- Syndication/recycled news: SimHash near-dup within 72h → one
  `story_cluster`. A cluster contributes `dedup_weight = 1/√cluster_size`
  per member (sub-linear: 40 reprints of one wire story ≠ 40 signals, but
  broad pickup is still worth more than one obscure post — and
  `distinct_domains` feeds breadth where the real information lives).
  This also handles "recycled news": a re-run of an old story SimHash-joins
  its original cluster and adds ~nothing.
- Reddit crossposts and repost bots: collapse by target URL + near-dup title.

**Layer 2 — manipulation heuristics (S6 inputs, computed per entity/24h):**

- **Author concentration**: share of weighted mentions from top-5
  `author_hash` values. > 0.5 → penalty ramp. Bot rings and pump crews are
  few-author by nature.
- **Copypasta ratio**: near-dup mention text share *within* the entity's
  mentions (distinct from story clustering — catches coordinated posting of
  the same blurb across threads).
- **Burst-shape anomaly**: > 80% of a spike inside one 10-min slice followed
  by silence — organic bursts have decay tails, coordinated blasts don't.
- **Single-venue dominance**: > 85% of weighted mentions from one source
  class with zero corroboration elsewhere after 12h.
- **Domain reputation**: static denylist/greylist of PR-spam and
  SEO-content-farm domains (curated, starts small, grows from audits).

These max-combine into S (capped 0.6, §7). Honesty note: without paid
platform data (account age, karma graphs), bot detection is heuristic-only.
The *structural* defense is breadth — coordinated pumps concentrated in one
venue lose to the B component and the Confirmation surface no matter how
much raw volume they generate. That is why B carries 0.30 weight.

**Layer 3 — statistical guards (§7):** additive smoothing, variance floors,
winsorized inputs (counts clipped at p99 before EWMA update so one insane
hour doesn't poison the baseline), percentile mapping.

**Layer 4 — audit loop (§11):** weekly human labeling of top-K per surface;
labeled spam feeds the domain greylist, alias blocklist, and detector
thresholds. Plus synthetic-attack injection tests in CI so regressions in
the spam gates fail the build, not the product.

## 10. Model-routing plan

**Runtime (pipeline):**

| Task | Route | Why |
|---|---|---|
| Ingest, dedup, SimHash, dictionary match, rollups, baselines, scoring, ranking, serve | Deterministic code | ~95% of the pipeline. Testable, free, fast. Any LLM here is unjustifiable cost and nondeterminism. |
| Ambiguous-mention adjudication (§6 Tier 2) | Haiku, batched, cached, capped | Bounded queue, cache-friendly, cents/day. |
| Sentiment sampling (top ~100 entities) | Haiku, batched | Finance slang needs a real model; sampling keeps it ~1–2k calls/day. |
| "Why trending" blurbs (surface-visible entities, regenerate only on story-cluster change) | Haiku; Sonnet only if blurb quality is a flagship differentiator | Evidence-grounded 1–2 sentence synthesis from top clusters. |
| Alias proposal, weekly audit assist, goldset adjudication, weight-tuning analysis | Premium tier (Fable/Opus-class), offline only | Low volume, high leverage, never latency- or cost-sensitive. |

Hard rule: zero premium-model calls in the 30-min cycle, and the cycle must
complete correctly with the LLM budget at zero.

**Build time (who writes the code):**

| Work | Model |
|---|---|
| Architecture decisions, scoring/statistics engine, ER match-policy logic and Tier-2 design, eval harness design, idempotency/replay semantics | Top tier (Fable/Opus-class) — this is where subtle bugs are expensive |
| Source adapters, migrations, rollup SQL, API routes, frontend components, tests, workflow YAML | Sonnet — the bulk of the build |
| Boilerplate/config/docstrings | Haiku is marginal at build time; Sonnet everywhere non-critical is simpler and cheap enough |

## 11. Evaluation / backtesting plan

The replay substrate (immutable `trend_raw_items` + as-of discipline: every
stage reads only data with `published_at ≤ T`, baselines computed strictly
excluding the evaluation window) makes all of this possible. Build the
harness in phase 3, not later — untested ranking code is untrustworthy
ranking code.

**Is "rising" actually rising? — continuation backtest.**
For historical T: compute Most Climbing top-20 as of T using only ≤T data.
Measure attention over (T, T+24h]. Metric: **continuation precision@20** =
share whose next-24h weighted mentions ≥ baseline + 1σ. Controls: (a)
random eligible entities, (b) **naive ranker** (raw count delta, no
baselines/gates). The composite must beat the naive ranker on both
continuation and audit precision — if it doesn't, the sophistication is
unjustified and gets simplified. This is the honesty test for the whole
scoring layer.

**Event probes — free ground truth.** Scheduled events (earnings dates from
the existing earnings module, Fed days, major coin unlocks) must surface the
affected entities. Recall@event: did the reporting ticker enter Most
Climbing within N hours of its earnings? Misses are coverage or resolution
bugs, and this probe finds them without any human labeling.

**Early Breakout lead time.** For every entity that eventually enters
Overall Heat top-20: did Early Breakout flag it earlier, and by how many
hours? Median lead time is *the* KPI for that surface; a surface with ~zero
lead time is decoration and should be cut or reworked.

**Garbage-catch rate — synthetic attacks in CI.** Inject scripted attacks
into a staging replay: 500 near-identical Reddit posts from 5 authors;
one wire story syndicated to 60 domains; a 10-minute single-venue blast on
a dormant small cap. Assert none enters any surface top-20. These are unit
tests for §9 and run on every change to scoring or spam code.

**Human audit — weekly precision.** Top-10 per surface, labeled against a
fixed taxonomy: `real / echo-of-old-news / spam-manipulation / duplicate /
wrong-entity`. Precision@10 per surface tracked over time; `wrong-entity`
rate is also the ER quality metric (target < 2% on equities — ticker
collisions are the known hard case). Premium model pre-labels, human
confirms — ~30 minutes/week of human time.

**Stability.** Kendall tau between consecutive snapshots per surface.
Target band, not maximum: too low = jitter (users see churn), suspiciously
high = the surface isn't responding to real change. Alert outside band.

**ER goldset.** ~500 hand-labeled snippets over the collision-prone alias
set (built once with premium-model assist); Tier-1 policies + Tier-2
prompts regression-test against it in CI.

## 12. API contract

Read-only routes under `app/api/trends/*`, all serving persisted snapshots
(nothing computed per-request). `as_of` on every response; clients never
extrapolate.

```
GET /api/trends/surfaces/:surface?window=24h&type=equity|etf|crypto|topic|all&limit=25
```
```jsonc
{
  "surface": "cross_platform_confirmation",
  "as_of": "2026-07-14T14:30:00Z",
  "window": "24h",
  "items": [{
    "entity": { "id": 812, "type": "equity", "name": "…", "symbol": "…" },
    "rank": 1, "delta_rank": 3,            // vs previous snapshot; null = new
    "heat": 87.4,
    "components": { "velocity_z": 4.1, "accel": 0.62, "breadth": 0.83,
                    "persistence": 0.71, "quality": 0.94, "spam_penalty": 0.05 },
    "confirmations": { "news": 3.8, "forum": 2.9, "social": 4.4,
                       "reference": 1.6 },   // per-source-class z; the confirmation matrix
    "sentiment_skew": -0.34,               // null until sentiment lane enabled
    "badges": ["confirmed"],               // "speculative" | "confirmed" | "spam_risk" | "new"
    "first_seen": "2026-07-13T09:00:00Z",  // start of current episode (first bucket z>1)
    "sparkline": [/* 7d of daily weighted mentions, z-scaled */],
    "why": "…",                            // 1–2 sentence Haiku blurb, evidence-grounded; null if not generated
    "evidence": [{ "title": "…", "url": "…", "source": "news", "domain": "…",
                   "published_at": "…" }]  // top 3; full list via entity route
  }]
}
```
```
GET /api/trends/entities/:id?window=7d   → entity detail: per-source-class hourly/daily
                                           series, score history, episode boundaries,
                                           full component history
GET /api/trends/entities/:id/evidence?limit=50&source_class=news
GET /api/trends/health                   → per-source staleness tier, breaker state,
                                           unresolved_rate, llm_budget_used (RULES.md posture)
```

Contract rules: components always present (never hide inputs); ineligible
or spam-suppressed entities are absent from surfaces but fully inspectable
via the entity route; every list item carries enough to render a card
without a second request.

## 13. Frontend module outputs

`app/Projects/Trends-Finder/` (page.tsx + view.tsx, house component
language — Atmosphere/Chrome, premium dark). One screen, three levels:

1. **Surface board.** Five tabs (Most Climbing / Overall Heat /
   Cross-Platform Confirmation / Early Breakout / Fading Fast), universe
   filter (equities · ETFs · crypto · macro), window toggle (24h/7d),
   `as_of` + source-health strip (reuses staleness-tier semantics — a
   degraded source is shown, not hidden).
2. **Trend cards** (the ranked list). Each: entity + symbol + type chip;
   heat with delta-rank arrow; 7d sparkline; **confirmation chips** — one
   per source class, lit by that class's own z (this is the premium tell:
   *where* it's rising, at a glance); component strip (V/A/B/P as compact
   bars); sentiment gauge; badges (`speculative` on all Early Breakout,
   `spam_risk` when S > 0.25); "why now" blurb; first-seen timestamp.
3. **Entity drill-down** (panel/route). Stacked per-source time series with
   episode shading; score-history chart; evidence feed grouped by story
   cluster (so 30 syndicated headlines render as one story, domain count
   shown); full component breakdown including spam evidence — the "prove
   it" view that separates this from a trending widget.

Anti-noise UI defaults: hysteresis + delta-rank (§8) instead of live
reshuffling; Early Breakout visually quarantined from confirmed surfaces;
no infinite feed — 25 items max per surface, by design.

## 14. Risks / unknowns

Ordered by expected damage:

1. **Reddit ToS / commercial licensing.** Free tier is non-commercial;
   A3RO's premium direction eventually collides with that (~$12k/yr entry
   for commercial). **Decision needed before launch, not before coding**:
   MVP can run as non-commercial R&D, but pricing a product on Reddit data
   without a license is a business risk. Mitigation: keep per-source-class
   weights degradable so Reddit removal degrades rather than breaks the
   product; budget the license into any paid-tier pricing.
2. **No X = blind spot on the fastest finance chatter.** Fintwit leads
   Reddit/news by hours for many equity moves; Bluesky's finance density
   is not a real substitute today. Accept at MVP; the honest posture is a
   visible "social coverage: partial" note, not silence. Scale-up path is
   narrow pay-per-use confirmation reads (§3.2), never broad discovery.
3. **Ticker-collision false positives.** The known ER failure mode.
   Policies in §6 should contain it, but the *actual* wrong-entity rate is
   unknown until the goldset exists — build it in phase 1, and don't ship
   equity surfaces publicly before wrong-entity < ~2% on audit.
4. **Small-cap mention starvation.** Free sources may be too thin for the
   Early Breakout dream case (dormant small cap waking up) — the lane may
   surface mostly noise at the low end. Mitigation: restricted breakout
   universe at launch; expand only when eval shows acceptable precision.
5. **Baseline cold start + seasonality.** ~4 weeks before z-scores mean
   anything; weekend/market-hours rhythms will distort early scores.
   Burn-in is non-negotiable; weekend multiplier v1, seasonal baselines
   later (§3.7).
6. **GDELT operational flakiness.** Duplicates, hiccups, occasional
   outages. RSS redundancy + breaker + fresh-source breadth denominators
   are the containment; do not build any single-source-dependent feature.
7. **Scheduler economics.** Actions cron drift is handled (event-time
   buckets), but private-repo minutes cost real money at 48 runs/day
   (~5,800 min/mo vs 2,000 free) — decide early: public repo, paid minutes
   (~$25–30/mo), or a small worker (§3.1).
8. **Google Trends alpha uncertainty.** Apply day 1; plan as if rejected.
   Wikipedia pageviews is the committed search-interest proxy. Do not
   build on pytrends-style scraping — fragile and ToS-adverse.
9. **Sentiment cost/quality trade.** Sampled Haiku sentiment on finance
   slang is unvalidated; ship it dark (stored, not displayed) for 2 weeks
   and audit before exposing the gauge.

Decisions that must be made before coding: (a) scheduler choice (7),
(b) Reddit legal posture (1), (c) Early Breakout launch universe (4),
(d) burn-in length / launch gate criteria (5 + §11 thresholds).

## 15. Recommended build phases

Sequencing principle: **data collection starts in week 1** — every week of
ingest is a week of baselines the scoring layer will need. Build order
follows data dependency, not UI urgency.

- **P0 (wk 1–2) — substrate.** Migrations 014–016; universe + alias
  registry seeded (SEC, CoinGecko, macro topics) + curation pass; GDELT,
  RSS, HN adapters on the descriptor contract; `trends-scan.yml` running
  ingest every 30 min; `TRENDS_RULES.md` drafted. *Exit: raw items
  accumulating, source_health green.* Also: apply for Google Trends alpha.
- **P1 (wk 2–4) — resolution.** Reddit adapter; S2 normalize/dedup/story
  clustering; Tier-1 mention extraction with match policies; hourly
  rollups; ER goldset built; wrong-entity rate first measured. *Exit:
  `entity_metrics_hourly` populating with plausible per-entity series.*
- **P2 (wk 4–6) — scoring.** Baselines + statistics; composite engine;
  Tier-2 Haiku adjudication with cache + budget; snapshots; Most Climbing
  + Overall Heat via internal JSON API. *Exit: internal rankings reviewed
  daily against "does this match what actually happened."*
- **P3 (wk 6–8) — trust.** Spam detectors + synthetic-attack CI tests;
  breadth/persistence components; remaining three surfaces; Wikipedia
  pageviews + CoinGecko confirm layers; replay/eval harness with
  continuation backtest + event probes; first weight tuning. *Exit: beats
  naive ranker; audit precision@10 ≥ ~0.7 on confirmed surfaces.*
- **P4 (wk 8–10) — product.** Frontend module; sentiment lane (dark →
  audited → visible); YouTube adapter (channel-upload polling within
  quota); blurbs; health route; public burn-in exit per §14 gates.
- **P5 (later, demand-driven).** Bluesky adapter; Google Trends if granted;
  open-vocabulary discovery lane; universe expansion; scheduler move; X
  confirmation reads if paid data is ever justified.

## 16. Final verdict on best MVP design

The MVP that is actually buildable and defensible: a **closed-universe,
dictionary-first, batch pipeline on the existing A3RO serverless rails** —
Postgres only, 30-minute event-time cycles, five free sources (GDELT + RSS
+ Reddit + HN + Wikipedia pageviews), z-score statistics against per-entity
per-source EWMA baselines, one composite with multiplicative quality/spam
gates, five surfaces as five orderings over one component vector, LLMs
confined to budgeted edges, and raw immutability from day 1 so every claim
the product makes is backtestable.

What makes it premium rather than a trending widget is not source
exclusivity — the sources are free and anyone can poll them. It is (a) the
baseline discipline: "rising relative to its own normal," not "big number";
(b) breadth as a first-class, manipulation-resistant confirmation signal
with the per-source matrix exposed; (c) explainability all the way down —
every rank carries its components and evidence; and (d) the eval loop —
continuation backtests and attack injections that most trend products
simply don't have. Those four are also the defensible moat, because they
compound with collected history while scrapers start from zero.

Weakest honest points, restated: no X coverage (real gap, priced-in),
Reddit's legal posture (business decision pending), and Early Breakout's
precision on thin small-cap data (gated until proven). None of these blocks
the build; all three are visible on the risk register with owners and exit
criteria rather than hidden in optimism.
