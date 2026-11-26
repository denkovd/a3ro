"""
A3RO Execute — BTC Event Pivots v1.1: Python port of pine/a3ro_execute_v1_1.pine.

The rules here are FROZEN for strategy_version "v1.1". Any rule change needs a
new version string (and a fresh forward paper record), never an edit in place.

Fill model follows TradingView's broker emulator: if the open is closer to the
high the bar path is O→H→L→C, otherwise O→L→H→C. Market orders queued at a bar
close fill at the next bar's open. Fees 0.05% per side.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

STRATEGY_VERSION = "v1.1"
NY = ZoneInfo("America/New_York")
H = pd.Timedelta(hours=1)


@dataclass(frozen=True)
class Params:
    look_days: int = 7
    vol_days: int = 30
    z_thr: float = 0.75
    strong_pct: float = 6.0       # checklist Q4 (info only)
    ema_len: int = 50             # Q1
    sma_len: int = 200            # Q2
    prior_days: int = 30          # Q3
    rsi_hi: float = 65            # Q5
    rsi_lo: float = 35
    nar_pct: float = 4.0          # monthly bias for the month-open confluence flag (info only)
    mon_days: int = 10
    mon_window: int = 7
    risk_pct: float = 3.0
    max_lev: float = 3.0
    arm_hrs: int = 24
    cancel_hrs: int = 12
    step_pct: float = 0.75
    swing_days: int = 3
    buf_pct: float = 0.5
    max_stop: float = 3.0
    tp1_pct: float = 2.0
    trail_act: float = 4.0
    trail_off: float = 1.5
    time_hrs: int = 96
    fee: float = 0.0005
    capital: float = 100_000.0


V1_1 = Params()


# ── Events ───────────────────────────────────────────────────────────────────
def ny_event(day: str, kind: str) -> pd.Timestamp:
    y, m, d = map(int, day.split("-"))
    hh, mm = (14, 0) if kind == "FOMC" else (8, 30)
    return pd.Timestamp(datetime(y, m, d, hh, mm, tzinfo=NY)).tz_convert("UTC")


# ── Indicators ───────────────────────────────────────────────────────────────
def _rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def features(df: pd.DataFrame, p: Params = V1_1) -> pd.DataFrame:
    """df: UTC-indexed 1H bars with open/high/low/close. Values on a row are known at that bar's close."""
    f = df.copy()
    lb, pb, sb, vb, mb = p.look_days * 24, p.prior_days * 24, p.swing_days * 24, p.vol_days * 24, p.mon_days * 24
    f["move"] = 100 * (f.close / f.close.shift(lb) - 1)
    logret = np.log(f.close / f.close.shift(1))
    sigma = logret.rolling(vb).std(ddof=0).shift(lb)            # Pine ta.stdev = population stdev
    f["z"] = np.log(f.close / f.close.shift(lb)) / (sigma * np.sqrt(lb))
    f["runHi"] = f.high.rolling(lb).max(); f["runLo"] = f.low.rolling(lb).min()
    f["priHi"] = f.high.rolling(pb).max().shift(lb); f["priLo"] = f.low.rolling(pb).min().shift(lb)
    f["swHi"] = f.high.rolling(sb).max(); f["swLo"] = f.low.rolling(sb).min()
    f["moveM"] = 100 * (f.open / f.close.shift(mb) - 1)
    d = df.close.resample("1D").last()
    dd = pd.DataFrame({"dClose": d, "dEma": d.ewm(span=p.ema_len, adjust=False).mean(),
                       "dSma": d.rolling(p.sma_len).mean()}).shift(1)
    f = f.join(dd.reindex(f.index, method="ffill"))
    r4 = _rsi(df.close.resample("4h").last()).shift(1)
    f["rsi4"] = r4.reindex(f.index, method="ffill")
    return f


def lean_of(z: float, p: Params = V1_1) -> int:
    """-1 = fade a rally (short), +1 = fade a sell-off (long), 0 = no narrative."""
    if z is None or not np.isfinite(z):
        return 0
    return -1 if z >= p.z_thr else (1 if z <= -p.z_thr else 0)


def checklist(row, d: int, mon_conf: bool, p: Params = V1_1) -> dict:
    """Q1–Q5 + month-open confluence. Info only in v1.1 — never gates or sizes."""
    if d == 0:
        d = -1 if (row.move or 0) >= 0 else 1
    q = {
        "q1_htf_trend": bool(row.dClose < row.dEma) if d == -1 else bool(row.dClose > row.dEma),
        "q2_bull_bear": bool(row.dClose < row.dSma) if d == -1 else bool(row.dClose > row.dSma),
        "q3_liquidity_swept": bool(row.runHi > row.priHi) if d == -1 else bool(row.runLo < row.priLo),
        "q4_strong_push": bool(abs(row.move) >= p.strong_pct) if pd.notna(row.move) else False,
        "q5_exhausted": bool(row.rsi4 >= p.rsi_hi) if d == -1 else bool(row.rsi4 <= p.rsi_lo),
        "month_confluence": bool(mon_conf),
    }
    q["score"] = min(5, sum(int(v) for v in q.values()))
    q["rsi4"] = None if pd.isna(row.rsi4) else round(float(row.rsi4), 1)
    return q


# ── Simulator ────────────────────────────────────────────────────────────────
@dataclass
class Trade:
    event_kind: str
    event_time: pd.Timestamp
    armed_at: pd.Timestamp
    side: int
    z: float
    move: float
    risk_pct: float
    equity_at_arm: float
    stop: float | None = None
    levels: dict = field(default_factory=dict)       # e1/e2/e3/stop/tp1
    checklist: dict = field(default_factory=dict)
    entries: list = field(default_factory=list)      # {tag, price, qty, time}
    exits: list = field(default_factory=list)
    pnl: float = 0.0
    status: str = "pending"                          # pending | open | closed | skipped
    skip_reason: str | None = None
    opened_at: pd.Timestamp | None = None
    closed_at: pd.Timestamp | None = None

    @property
    def pnl_pct(self) -> float:
        return 100 * self.pnl / self.equity_at_arm if self.equity_at_arm else 0.0


class Simulator:
    """Bar-by-bar v1.1 state machine. Feed it every 1H bar in order via run()."""

    def __init__(self, events: list[tuple[pd.Timestamp, str]], p: Params = V1_1, start: pd.Timestamp | None = None):
        self.p = p
        self.events = sorted(events)
        self.start = start
        self.ei = 0
        self.cash = p.capital
        self.pos = 0.0
        self.avg = 0.0
        self.pend: list[list] = []
        self.st: dict | None = None
        self.queued_market = None
        self.close_next = False
        self.trades: list[Trade] = []           # closed + skipped, in order
        self.event_log: list[dict] = []
        self.equity: list[tuple[pd.Timestamp, float]] = []
        self.mon_bias, self.mon_bias_end, self.month_prev = 0, None, None

    # -- helpers
    def eq_at(self, px):
        return self.cash + (self.pos * (px - self.avg) if self.pos else 0.0)

    def _fill(self, px, qty, tag, t):
        p, tr = self.p, self.st["trade"]
        self.cash -= abs(qty) * px * p.fee
        tr.pnl -= abs(qty) * px * p.fee
        if self.pos == 0 or np.sign(qty) == np.sign(self.pos):
            self.avg = (self.avg * abs(self.pos) + px * abs(qty)) / (abs(self.pos) + abs(qty))
            self.pos += qty
            tr.entries.append(dict(tag=tag, price=float(px), qty=float(abs(qty)), time=t.isoformat()))
            if tr.opened_at is None:
                tr.opened_at = t; tr.status = "open"
        else:
            q = min(abs(qty), abs(self.pos))
            pnl = q * (px - self.avg) * np.sign(self.pos)
            self.cash += pnl
            tr.pnl += pnl
            self.pos -= np.sign(self.pos) * q
            tr.exits.append(dict(tag=tag, price=float(px), qty=float(q), time=t.isoformat()))
            if abs(self.pos) < 1e-12:
                self.pos = 0.0

    def _finish(self, t):
        tr = self.st["trade"]
        tr.status = "closed"; tr.closed_at = t
        self.trades.append(tr)
        self.st = None; self.pend = []

    # -- main loop
    def run(self, f: pd.DataFrame):
        p = self.p
        idx = f.index
        for i in range(1, len(idx)):
            t = idx[i]; row = f.iloc[i]
            o, h, l, c = row.open, row.high, row.low, row.close
            st = self.st

            if self.queued_market is not None and st:
                self._fill(o, self.queued_market, "E1", t); st["fills"] += 1; self.queued_market = None
            if self.close_next and self.pos != 0:
                self._fill(o, -self.pos, "Time stop", t)
            self.close_next = False

            if st and (self.pos != 0 or self.pend):
                path = [o, h, l, c] if abs(o - h) < abs(o - l) else [o, l, h, c]
                for a, b in zip(path[:-1], path[1:]):
                    lo_, hi_ = min(a, b), max(a, b)
                    orders = []
                    for k, (lp, q) in enumerate(self.pend):
                        if lo_ <= lp <= hi_ and ((q < 0 and b > a) or (q > 0 and b < a)):
                            orders.append((abs(lp - a), "entry", k, lp))
                    if self.pos != 0:
                        sh = self.pos < 0
                        stop = st["be"] if st["partial"] else st["sl"]
                        trailing = False
                        if st["trail_on"]:
                            tr_ = st["ext"] * (1 + p.trail_off / 100) if sh else st["ext"] * (1 - p.trail_off / 100)
                            trailing = (tr_ < stop) if sh else (tr_ > stop)
                            stop = min(stop, tr_) if sh else max(stop, tr_)
                        if lo_ <= stop <= hi_ and ((sh and b > a) or (not sh and b < a)):
                            orders.append((abs(stop - a), "trail" if trailing else "stop", 0, stop))
                        if not st["partial"]:
                            tp = st["tp1"]
                            if lo_ <= tp <= hi_ and ((sh and b < a) or (not sh and b > a)):
                                orders.append((abs(tp - a), "tp1", 0, tp))
                    for _, kind, k, px in sorted(orders, key=lambda x: x[0]):
                        if kind == "entry" and k < len(self.pend) and not st["partial"] and not np.isnan(self.pend[k][0]):
                            self._fill(px, self.pend[k][1], f"E{st['fills'] + 1}", t); st["fills"] += 1
                            self.pend[k] = [np.nan, 0]
                        elif kind == "tp1" and self.pos != 0 and not st["partial"]:
                            self._fill(px, -self.pos / 2, "TP1 50%", t)
                            st["partial"] = True; st["be"] = self.avg; self.pend = []
                        elif kind in ("stop", "trail") and self.pos != 0:
                            self._fill(px, -self.pos, "Trail" if kind == "trail" else ("BE" if st["partial"] else "SL"), t)
                    self.pend = [x for x in self.pend if not np.isnan(x[0])]
                    if self.pos != 0:
                        sh = self.pos < 0
                        fav = min(a, b) if sh else max(a, b)
                        actp = self.avg * (1 - p.trail_act / 100) if sh else self.avg * (1 + p.trail_act / 100)
                        if (sh and fav <= actp) or (not sh and fav >= actp):
                            st["trail_on"] = True
                        if st["trail_on"]:
                            st["ext"] = min(st["ext"], fav) if sh else max(st["ext"], fav)
                    if self.pos == 0 and st["fills"] > 0:
                        break

            if st:
                if self.pos != 0:
                    sh = self.pos < 0
                    if not st["partial"]:
                        st["tp1"] = self.avg * (1 - p.tp1_pct / 100) if sh else self.avg * (1 + p.tp1_pct / 100)
                    if t >= st["expire"]:
                        self.pend = []
                    if t >= st["stopT"]:
                        self.close_next = True
                elif st["fills"] > 0:
                    self._finish(t)
                elif t >= st["expire"] and self.queued_market is None:
                    self._finish(t)      # never filled (cannot happen with a market E1, kept for safety)

            # monthly bias (only feeds the info-only confluence flag)
            if self.month_prev is not None and t.month != self.month_prev:
                mm = row.moveM
                self.mon_bias = -1 if mm >= p.nar_pct else (1 if mm <= -p.nar_pct else 0)
                self.mon_bias_end = t + pd.Timedelta(days=p.mon_window)
            self.month_prev = t.month

            # triggers: arm on the bar whose close passes event - arm_hrs
            trig = None
            while self.ei < len(self.events) and t + H > self.events[self.ei][0] - pd.Timedelta(hours=p.arm_hrs):
                ev_t, kind = self.events[self.ei]
                if t < ev_t + pd.Timedelta(hours=p.cancel_hrs) and trig is None:
                    trig = (kind, ev_t)
                self.ei += 1
            if trig is not None and (self.start is None or t >= self.start):
                self._arm(t, row, *trig)
            self.equity.append((t, self.eq_at(c)))
        return self

    def _arm(self, t, row, kind, ev_t):
        p = self.p
        z = float(row.z) if pd.notna(row.z) else float("nan")
        mv = float(row.move) if pd.notna(row.move) else float("nan")
        d = lean_of(z, p)
        mon_conf = self.mon_bias == d and d != 0 and self.mon_bias_end is not None and t <= self.mon_bias_end
        ck = checklist(row, d, mon_conf, p)
        log = dict(event_kind=kind, event_time=ev_t, armed_at=t, z=z, move=mv, lean=d, checklist=ck, btc_price=float(row.close))
        equity = self.eq_at(row.close)
        tr = Trade(kind, ev_t, t, d, z, mv, p.risk_pct, equity, checklist=ck)
        if self.st is not None or self.pos != 0:
            log["result"] = "skip: trade already active"
            if d != 0:
                tr.status, tr.skip_reason = "skipped", "trade already active"; self.trades.append(tr)
        elif d == 0:
            log["result"] = "no narrative"
        else:
            c = row.close
            e1 = c
            e2 = e1 * (1 - d * p.step_pct / 100)
            e3 = e1 * (1 - d * 2 * p.step_pct / 100)
            sl = max(e3, row.swHi) * (1 + p.buf_pct / 100) if d == -1 else min(e3, row.swLo) * (1 - p.buf_pct / 100)
            sd = abs(sl / e1 - 1) * 100
            tr.levels = dict(e1=float(e1), e2=float(e2), e3=float(e3), stop=float(sl), stop_dist_pct=round(sd, 2))
            tr.stop = float(sl)
            if sd > p.max_stop:
                log["result"] = f"stop too wide {sd:.1f}%"
                tr.status, tr.skip_reason = "skipped", f"stop too wide ({sd:.1f}% > {p.max_stop}%)"; self.trades.append(tr)
            else:
                avg_risk = (abs(sl - e1) + abs(sl - e2) + abs(sl - e3)) / 3
                qty = min(equity * p.risk_pct / 100 / avg_risk, p.max_lev * equity / ((e1 + e2 + e3) / 3))
                q3 = qty / 3 * d
                tr.levels["tp1"] = float(e1 * (1 + d * p.tp1_pct / 100))
                self.st = dict(trade=tr, sl=sl, be=None, tp1=e1 * (1 + d * p.tp1_pct / 100), partial=False, trail_on=False,
                               ext=e1, fills=0, expire=ev_t + pd.Timedelta(hours=p.cancel_hrs),
                               stopT=ev_t + pd.Timedelta(hours=p.time_hrs))
                self.queued_market = q3
                self.pend = [[e2, q3], [e3, q3]]
                log["result"] = "ENTER"
        self.event_log.append(log)

    # -- outputs
    def open_trade(self) -> Trade | None:
        return self.st["trade"] if self.st else None

    def summary(self) -> dict:
        closed = [t for t in self.trades if t.status == "closed"]
        pnl = np.array([t.pnl for t in closed])
        wins, losses = pnl[pnl > 0], pnl[pnl <= 0]
        eq = pd.Series(dict(self.equity)) if self.equity else pd.Series(dtype=float)
        # Drawdown in dollars over starting capital (matches the published v1.1 figure, −8.4%).
        dd = float((eq - eq.cummax()).min() / self.p.capital) if len(eq) else 0.0
        by_year: dict[str, dict] = {}
        for t in closed:
            y = str(t.event_time.year)
            b = by_year.setdefault(y, dict(trades=0, pnl=0.0, wins=0))
            b["trades"] += 1; b["pnl"] += t.pnl; b["wins"] += int(t.pnl > 0)
        return dict(
            trades=len(closed),
            net_pct=round(100 * pnl.sum() / self.p.capital, 2) if len(pnl) else 0.0,
            profit_factor=round(float(wins.sum() / -losses.sum()), 2) if losses.sum() < 0 else None,
            win_rate=round(100 * len(wins) / len(pnl), 1) if len(pnl) else None,
            max_dd_pct=round(100 * dd, 2),
            by_year={y: dict(trades=b["trades"], net_pct=round(100 * b["pnl"] / self.p.capital, 2),
                             win_rate=round(100 * b["wins"] / b["trades"], 1)) for y, b in sorted(by_year.items())},
        )
