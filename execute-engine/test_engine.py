"""pytest execute-engine/  — parity with the published v1.1 backtest needs local Binance zips in
EXECUTE_PARITY_DATA (a folder of BTCUSDT-1h-*.zip); that test is skipped without them."""
import os

import numpy as np
import pandas as pd
import pytest

import calendar_data
import execute_engine
from strategy import V1_1, Simulator, Trade, features, lean_of, ny_event


def synthetic(hours=24 * 300, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2025-01-01", periods=hours, freq="h", tz="UTC")
    close = 50_000 * np.exp(np.cumsum(rng.normal(0, 0.006, hours)))
    open_ = np.r_[close[0], close[:-1]]
    hi = np.maximum(open_, close) * (1 + rng.uniform(0, 0.003, hours))
    lo = np.minimum(open_, close) * (1 - rng.uniform(0, 0.003, hours))
    return pd.DataFrame(dict(open=open_, high=hi, low=lo, close=close), index=idx)


def test_z_matches_pine_definition():
    df = synthetic()
    f = features(df)
    i = 24 * 200
    c = df.close.values
    lr = np.log(c[1:] / c[:-1])                       # lr[k] = log(c[k+1]/c[k])
    sigma = np.std(lr[i - 168 - 720:i - 168], ddof=0)  # 720 returns ending 168 bars before bar i
    z = np.log(c[i] / c[i - 168]) / (sigma * np.sqrt(168))
    assert f.z.iloc[i] == pytest.approx(z, rel=1e-9)


def test_lean_threshold():
    assert lean_of(0.75) == -1 and lean_of(-0.75) == 1 and lean_of(0.7499) == 0 and lean_of(float("nan")) == 0


def test_event_times_in_new_york():
    assert ny_event("2026-12-09", "FOMC") == pd.Timestamp("2026-12-09T19:00Z")      # EST
    assert ny_event("2026-06-10", "CPI") == pd.Timestamp("2026-06-10T12:30Z")       # EDT


def test_arms_on_bar_containing_event_minus_24h():
    df = synthetic()
    ev = pd.Timestamp("2025-09-10T12:30Z")
    sim = Simulator([(ev, "CPI")]).run(features(df))
    assert sim.event_log[0]["armed_at"] == pd.Timestamp("2025-09-09T12:00Z")


def test_one_trade_at_a_time_and_stop_cap():
    df = synthetic(seed=7)
    evs = [(t, "CPI") for t in pd.date_range("2025-08-01T12:30Z", periods=8, freq="2D")]
    sim = Simulator(evs).run(features(df))
    for t in sim.trades:
        if t.status == "closed":
            assert t.levels["stop_dist_pct"] <= V1_1.max_stop
        if t.status == "skipped":
            assert t.skip_reason.startswith(("stop too wide", "trade already active"))


def test_paper_rows_never_overwrite_closed():
    class Cur:
        sql = []
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, s, v=None): Cur.sql.append(s)
    class Conn:
        def cursor(self): return Cur()
    trade = Trade("CPI", pd.Timestamp("2026-12-10T13:30Z"), pd.Timestamp("2026-12-09T13:00Z"), -1, 1.0, 5.0, 3.0, 1e5)
    execute_engine.write_trades(Conn(), [execute_engine.trade_row(trade, "paper", 1)], frozen_guard=True)
    assert "where execute_trades.status not in ('closed', 'skipped')" in Cur.sql[-1]


def test_seed_sql_covers_calendar():
    sql = execute_engine.seed_sql()
    assert sql.count("('FOMC'") == len(calendar_data.days(calendar_data.FOMC))
    assert sql.count("('CPI'") == len(calendar_data.days(calendar_data.CPI))


@pytest.mark.skipif(not os.environ.get("EXECUTE_PARITY_DATA"), reason="set EXECUTE_PARITY_DATA to a folder of Binance zips")
def test_parity_with_published_backtest():
    import glob, io, zipfile
    from market_data import _zip_frame
    frames = []
    for p in sorted(glob.glob(os.path.join(os.environ["EXECUTE_PARITY_DATA"], "BTCUSDT-1h-*.zip"))):
        with open(p, "rb") as fh:
            frames.append(_zip_frame(fh.read()))
    df = pd.concat(frames).drop_duplicates("t").sort_values("t").set_index("t")
    df = df[df.index < pd.Timestamp("2026-11-26T00:00Z")]
    sim = Simulator(calendar_data.builtin_events(), start=execute_engine.BACKTEST_START).run(features(df))
    s = sim.summary()
    assert (s["trades"], s["net_pct"], s["profit_factor"]) == (27, 38.36, 2.09)
    assert s["max_dd_pct"] == pytest.approx(-8.35, abs=0.01)     # published as −8.4%
