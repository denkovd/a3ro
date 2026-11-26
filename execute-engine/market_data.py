"""BTC 1H bars for the engine.

api.binance.com blocks US IPs (GitHub runners are in the US), so:
  1. data.binance.vision archive zips — monthly files for finished months, daily files after that
     (the daily archive lags about a day);
  2. Coinbase Exchange BTC-USD 1h candles for the hours after the last archived bar.
Only CLOSED bars are returned. Coinbase BTC-USD and Binance BTCUSDT differ by a few dollars;
that only ever affects the last ~day of bars and is accepted (see docs/execute-module-plan.md).
"""
from __future__ import annotations

import io
import json
import os
import time
import urllib.error
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

VISION = "https://data.binance.vision/data/spot"
COINBASE = "https://api.exchange.coinbase.com/products/BTC-USD/candles"
UA = {"User-Agent": "a3ro-execute-engine/1.1"}


def _get(url: str, timeout: int = 30) -> bytes | None:
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2 * (attempt + 1))
    return None


def _parse_kline_csv(raw: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(raw), header=None)
    if not str(df.iloc[0, 0]).replace(".", "").isdigit():
        df = df.iloc[1:]
    df = df.iloc[:, :5].astype(float)
    df.columns = ["t", "open", "high", "low", "close"]
    t0 = df["t"].astype("int64")
    df["t"] = pd.to_datetime(np.where(t0 > 1e14, t0 // 1000, t0), unit="ms", utc=True)   # µs since 2025
    return df


def _zip_frame(raw: bytes) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        return pd.concat([_parse_kline_csv(z.read(n)) for n in z.namelist()])


def _cached(cache_dir: str | None, name: str, url: str, immutable: bool) -> bytes | None:
    path = os.path.join(cache_dir, name) if cache_dir else None
    if path and immutable and os.path.exists(path):
        with open(path, "rb") as fh:
            return fh.read()
    raw = _get(url)
    if raw is not None and path and immutable:
        os.makedirs(cache_dir, exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(raw)
    return raw


def binance_archive(since: date, cache_dir: str | None = None, today: date | None = None) -> pd.DataFrame:
    today = today or datetime.now(timezone.utc).date()
    frames = []
    y, m = since.year, since.month
    while (y, m) < (today.year, today.month):
        n = f"BTCUSDT-1h-{y}-{m:02d}.zip"
        raw = _cached(cache_dir, n, f"{VISION}/monthly/klines/BTCUSDT/1h/{n}", immutable=True)
        if raw is None:      # monthly file for last month may not be published yet → fall back to dailies
            d = date(y, m, 1)
            while d.month == m:
                dn = f"BTCUSDT-1h-{d.isoformat()}.zip"
                draw = _cached(cache_dir, dn, f"{VISION}/daily/klines/BTCUSDT/1h/{dn}", immutable=True)
                if draw is not None:
                    frames.append(_zip_frame(draw))
                d += timedelta(days=1)
        else:
            frames.append(_zip_frame(raw))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    d = today.replace(day=1)
    while d < today:
        dn = f"BTCUSDT-1h-{d.isoformat()}.zip"
        raw = _cached(cache_dir, dn, f"{VISION}/daily/klines/BTCUSDT/1h/{dn}", immutable=True)
        if raw is not None:
            frames.append(_zip_frame(raw))
        d += timedelta(days=1)
    if not frames:
        raise RuntimeError("data.binance.vision returned no files")
    return pd.concat(frames).drop_duplicates("t").sort_values("t").set_index("t")


def coinbase_after(after: pd.Timestamp, now: pd.Timestamp) -> pd.DataFrame:
    """Closed 1h candles strictly after `after` (bar open time), up to the last closed hour."""
    rows = []
    start = after + pd.Timedelta(hours=1)
    last_open = now.floor("h") - pd.Timedelta(hours=1)          # last CLOSED bar's open time
    while start <= last_open:
        end = min(start + pd.Timedelta(hours=299), last_open)
        url = f"{COINBASE}?granularity=3600&start={start.isoformat()}&end={(end + pd.Timedelta(hours=1)).isoformat()}"
        raw = _get(url)
        for t, lo, hi, op, cl, _v in json.loads(raw or b"[]"):
            rows.append((pd.Timestamp(t, unit="s", tz="UTC"), op, hi, lo, cl))
        start = end + pd.Timedelta(hours=1)
        time.sleep(0.4)
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close"], index=pd.DatetimeIndex([], tz="UTC"))
    df = pd.DataFrame(rows, columns=["t", "open", "high", "low", "close"]).drop_duplicates("t").set_index("t").sort_index()
    return df[(df.index > after) & (df.index <= last_open)]


def load_bars(since: date, cache_dir: str | None = None, now: pd.Timestamp | None = None) -> tuple[pd.DataFrame, dict]:
    now = now or pd.Timestamp.now(tz="UTC")
    arch = binance_archive(since, cache_dir, now.date())
    arch = arch[arch.index <= now.floor("h") - pd.Timedelta(hours=1)]
    tail = coinbase_after(arch.index[-1], now)
    bars = pd.concat([arch, tail]).sort_index()
    bars = bars[~bars.index.duplicated(keep="first")].astype(float)
    # Gaps break bar-count lookbacks; forward-fill missing hours as flat bars and report them.
    full = pd.date_range(bars.index[0], bars.index[-1], freq="h", tz="UTC")
    missing = len(full) - len(bars)
    if missing:
        bars = bars.reindex(full)
        bars["close"] = bars["close"].ffill()
        for col in ("open", "high", "low"):
            bars[col] = bars[col].fillna(bars["close"])
    meta = dict(first=bars.index[0].isoformat(), last=bars.index[-1].isoformat(), binance_last=arch.index[-1].isoformat(),
                coinbase_bars=len(tail), filled_gaps=int(missing))
    return bars, meta


def reachability() -> dict:
    out = {}
    for name, url in [("binance_vision", f"{VISION}/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-2024-01.zip"),
                      ("coinbase", f"{COINBASE}?granularity=3600")]:
        try:
            out[name] = _get(url, timeout=15) is not None
        except Exception as e:  # noqa: BLE001
            out[name] = f"error: {type(e).__name__}"
    return out
