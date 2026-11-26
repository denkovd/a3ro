"""
A3RO Execute engine — BTC Event Pivots.

    python execute_engine.py check                   # can we reach the data sources?
    python execute_engine.py backfill                # hypothetical backtest trades + stats (mode=backtest)
    python execute_engine.py snapshot                # signal rows for events in the next 14 days
    python execute_engine.py step                    # advance the forward paper record (mode=paper)
    python execute_engine.py daily                   # snapshot + step (what the Action runs)
    python execute_engine.py seed-sql                # print INSERTs for execute_events
  flags: --dry-run (print JSON, no DB) · --only-in-window (exit early unless an event is within −26h…+100h)
         --cache-dir DIR (keep immutable archive zips between runs)

Writes go to Postgres through DATABASE_URL (same as the other A3RO workflows). Tables are locked to
anon/authenticated; the app reads them server-side.

Forward paper record: a deterministic replay of v1.1 from PAPER_START on fresh capital. A trade that is
already `closed` or `skipped` in the database is never rewritten, so the published record cannot drift.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

import numpy as np
import pandas as pd

import calendar_data
from market_data import load_bars, reachability
from strategy import STRATEGY_VERSION, V1_1, Simulator, Trade, checklist, features, lean_of, ny_event

# Frozen with the version: the forward record for v1.1 starts here and never moves.
PAPER_START = {"v1.1": pd.Timestamp("2026-11-27T00:00:00Z")}
BACKTEST_START = pd.Timestamp("2022-01-01T00:00:00Z")
WARMUP_DAYS = 260            # daily SMA200 + 37 days for the vol window
WINDOW_BEFORE_H, WINDOW_AFTER_H = 26, 100
SNAPSHOT_AHEAD_D = 14


# ── DB ───────────────────────────────────────────────────────────────────────
def connect():
    import psycopg
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set")
    # prepare_threshold=None: safe behind the Supabase transaction pooler.
    return psycopg.connect(url, autocommit=False, prepare_threshold=None)


def load_events(conn) -> list[tuple[pd.Timestamp, str, int | None]]:
    if conn is None:
        return [(t, k, None) for t, k in calendar_data.builtin_events()]
    with conn.cursor() as cur:
        cur.execute("select id, kind, event_time from execute_events order by event_time")
        rows = cur.fetchall()
    if not rows:
        sys.exit("execute_events is empty — apply the migration (it seeds the calendar)")
    return [(pd.Timestamp(t).tz_convert("UTC"), k, i) for i, k, t in rows]


def _num(x):
    if x is None:
        return None
    x = float(x)
    return None if not np.isfinite(x) else round(x, 6)


def trade_row(t: Trade, mode: str, event_id) -> dict:
    return dict(
        mode=mode, strategy_version=STRATEGY_VERSION, event_id=event_id,
        event_kind=t.event_kind, event_time=t.event_time.isoformat(), armed_at=t.armed_at.isoformat(),
        side="short" if t.side == -1 else "long", risk_pct=t.risk_pct,
        z=_num(t.z), move_7d_pct=_num(t.move), levels=t.levels, checklist=t.checklist,
        entries=t.entries, exits=t.exits, stop=_num(t.stop),
        pnl_pct=_num(round(t.pnl_pct, 4)) if t.status == "closed" else None,
        pnl_usd=_num(round(t.pnl, 2)) if t.status == "closed" else None,
        status=t.status, skip_reason=t.skip_reason,
        opened_at=t.opened_at.isoformat() if t.opened_at is not None else None,
        closed_at=t.closed_at.isoformat() if t.closed_at is not None else None,
    )


TRADE_COLS = ["mode", "strategy_version", "event_id", "event_kind", "event_time", "armed_at", "side", "risk_pct", "z",
              "move_7d_pct", "levels", "checklist", "entries", "exits", "stop", "pnl_pct", "pnl_usd", "status",
              "skip_reason", "opened_at", "closed_at"]
JSON_COLS = {"levels", "checklist", "entries", "exits"}


def _vals(row):
    return [json.dumps(row[c]) if c in JSON_COLS else row[c] for c in TRADE_COLS]


def write_trades(conn, rows: list[dict], frozen_guard: bool):
    cols = ", ".join(TRADE_COLS)
    ph = ", ".join(["%s"] * len(TRADE_COLS))
    upd = ", ".join(f"{c} = excluded.{c}" for c in TRADE_COLS if c not in ("mode", "strategy_version", "event_id"))
    where = " where execute_trades.status not in ('closed', 'skipped')" if frozen_guard else ""
    sql = (f"insert into execute_trades ({cols}, updated_at) values ({ph}, now()) "
           f"on conflict (mode, strategy_version, event_id) do update set {upd}, updated_at = now(){where}")
    with conn.cursor() as cur:
        for r in rows:
            cur.execute(sql, _vals(r))


def write_stats(conn, mode: str, s: dict, equity: list[dict]):
    with conn.cursor() as cur:
        cur.execute(
            """insert into execute_stats (mode, strategy_version, as_of, trades, net_pct, profit_factor, win_rate, max_dd_pct, by_year, equity)
               values (%s, %s, now(), %s, %s, %s, %s, %s, %s, %s)
               on conflict (mode, strategy_version) do update set as_of = now(), trades = excluded.trades,
                 net_pct = excluded.net_pct, profit_factor = excluded.profit_factor, win_rate = excluded.win_rate,
                 max_dd_pct = excluded.max_dd_pct, by_year = excluded.by_year, equity = excluded.equity""",
            (mode, STRATEGY_VERSION, s["trades"], s["net_pct"], s["profit_factor"], s["win_rate"], s["max_dd_pct"],
             json.dumps(s["by_year"]), json.dumps(equity)))


def equity_points(sim: Simulator) -> list[dict]:
    """Equity (as % of starting capital) after each closed trade — what the page charts."""
    pts, cum = [], 0.0
    for t in sim.trades:
        if t.status == "closed":
            cum += t.pnl
            pts.append(dict(t=t.closed_at.isoformat(), pct=round(100 * cum / sim.p.capital, 3)))
    return pts


def log_run(conn, mode: str, ok: bool, meta: dict):
    with conn.cursor() as cur:
        cur.execute("insert into execute_runs (mode, ok, meta) values (%s, %s, %s)", (mode, ok, json.dumps(meta, default=str)))


# ── Modes ────────────────────────────────────────────────────────────────────
def event_id_map(events):
    return {(t, k): i for t, k, i in events}


def run_backfill(f, events, conn, dry):
    sim = Simulator([(t, k) for t, k, _ in events], start=BACKTEST_START).run(f)
    ids = event_id_map(events)
    rows = [trade_row(t, "backtest", ids.get((t.event_time, t.event_kind))) for t in sim.trades]
    s = sim.summary()
    if dry:
        return dict(summary=s, trades=len(rows))
    with conn.cursor() as cur:
        cur.execute("delete from execute_trades where mode = 'backtest' and strategy_version = %s", (STRATEGY_VERSION,))
    write_trades(conn, rows, frozen_guard=False)
    write_stats(conn, "backtest", s, equity_points(sim))
    return dict(summary=s, trades=len(rows))


def run_step(f, events, conn, dry):
    start = PAPER_START[STRATEGY_VERSION]
    sim = Simulator([(t, k) for t, k, _ in events], start=start).run(f)
    ids = event_id_map(events)
    rows = [trade_row(t, "paper", ids.get((t.event_time, t.event_kind))) for t in sim.trades]
    live = sim.open_trade()
    if live is not None:
        rows.append(trade_row(live, "paper", ids.get((live.event_time, live.event_kind))))
    s = sim.summary()
    if dry:
        return dict(summary=s, rows=rows)
    write_trades(conn, rows, frozen_guard=True)
    write_stats(conn, "paper", s, equity_points(sim))
    return dict(summary=s, trades=len(rows), open=live is not None)


def run_snapshot(f, events, conn, dry, now):
    last_bar = f.index[-1]
    last_close_time = last_bar + pd.Timedelta(hours=1)
    out = []
    for ev_t, kind, ev_id in events:
        if not (now - pd.Timedelta(hours=WINDOW_AFTER_H) <= ev_t <= now + pd.Timedelta(days=SNAPSHOT_AHEAD_D)):
            continue
        arm_time = ev_t - pd.Timedelta(hours=V1_1.arm_hrs)
        # The arm bar is the first bar whose close passes arm_time, i.e. the bar containing it.
        arm_bar = arm_time.floor("h")
        armed = last_close_time > arm_time and arm_bar in f.index
        row = f.loc[arm_bar] if armed else f.iloc[-1]
        z = float(row.z) if pd.notna(row.z) else None
        d = lean_of(z if z is not None else float("nan"))
        ck = checklist(row, d, False)
        out.append(dict(
            event_id=ev_id, event_kind=kind, event_time=ev_t.isoformat(), snapshot_at=now.isoformat(),
            as_of_bar=(arm_bar if armed else last_bar).isoformat(), arm_time=arm_time.isoformat(),
            state="armed" if armed else "preview", btc_price=_num(row.close), move_7d_pct=_num(row.move), z=_num(z),
            z_threshold=V1_1.z_thr, lean={-1: "short", 1: "long", 0: "none"}[d], checklist=ck,
        ))
    if dry or not out:
        return dict(signals=out)
    with conn.cursor() as cur:
        for r in out:
            cur.execute(
                """insert into execute_signals (event_id, snapshot_at, as_of_bar, arm_time, state, btc_price, move_7d_pct, z,
                     z_threshold, lean, checklist, strategy_version)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (r["event_id"], r["snapshot_at"], r["as_of_bar"], r["arm_time"], r["state"], r["btc_price"], r["move_7d_pct"],
                 r["z"], r["z_threshold"], r["lean"], json.dumps(r["checklist"]), STRATEGY_VERSION))
    return dict(signals=len(out))


def in_window(events, now) -> bool:
    return any(-WINDOW_BEFORE_H <= (now - t).total_seconds() / 3600 <= WINDOW_AFTER_H for t, _, _ in events)


def seed_sql() -> str:
    lines = ["insert into public.execute_events (kind, event_time, source, notes) values"]
    vals = []
    for t, k in calendar_data.builtin_events():
        vals.append(f"  ('{k}', '{t.isoformat()}', '{'fed' if k == 'FOMC' else 'bls'}', null)")
    return "\n".join(lines) + "\n" + ",\n".join(vals) + "\non conflict (event_time) do nothing;"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["check", "backfill", "snapshot", "step", "daily", "seed-sql"])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only-in-window", action="store_true")
    ap.add_argument("--cache-dir", default=os.environ.get("EXECUTE_CACHE_DIR"))
    a = ap.parse_args(argv)
    now = pd.Timestamp.now(tz="UTC")

    if a.mode == "seed-sql":
        print(seed_sql()); return 0
    if a.mode == "check":
        r = reachability(); print(json.dumps(r)); return 0 if all(v is True for v in r.values()) else 1

    conn = None if a.dry_run else connect()
    events = load_events(conn)
    if a.only_in_window and not in_window(events, now):
        print(json.dumps(dict(skipped="no event within the hourly window"))); return 0

    since = (BACKTEST_START if a.mode == "backfill" else min(PAPER_START[STRATEGY_VERSION], now)) - pd.Timedelta(days=WARMUP_DAYS)
    meta = dict(mode=a.mode, version=STRATEGY_VERSION)
    try:
        bars, bmeta = load_bars(date(since.year, since.month, 1), a.cache_dir, now)
        meta["bars"] = bmeta
        f = features(bars)
        if a.mode == "backfill":
            meta["backfill"] = run_backfill(f, events, conn, a.dry_run)
        if a.mode in ("snapshot", "daily"):
            meta["snapshot"] = run_snapshot(f, events, conn, a.dry_run, now)
        if a.mode in ("step", "daily"):
            meta["step"] = run_step(f, events, conn, a.dry_run)
        if conn is not None:
            log_run(conn, a.mode, True, meta)
            conn.commit()
    except Exception as e:
        if conn is not None:
            conn.rollback()
            log_run(conn, a.mode, False, dict(meta, error=f"{type(e).__name__}: {e}"))
            conn.commit()
        raise
    print(json.dumps(meta, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
