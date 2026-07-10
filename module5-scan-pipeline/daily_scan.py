"""
daily_scan.py — daily scan pipeline for the market watchlist.

For each symbol in universe.json:
  1. Determine the last cached date (cache.py).
  2. Fetch only the missing range from yfinance (incremental — never
     re-downloads full history every day).
  3. Append new bars to that symbol's cache file.

Each symbol's fetch is wrapped in its own try/except so one bad symbol
(rate limit, delisting, network blip, malformed response) never stops
the rest of the batch. Failures are logged clearly and summarized at
the end; a one-day source outage for a symbol produces a one-day gap
in that symbol's cache, not data loss or a crashed run.

Exit code is always 0 unless the universe file itself can't be loaded —
per-symbol failures are a normal, expected operating condition and are
surfaced via the log summary, not a nonzero exit, so the GitHub Actions
job doesn't get marked failed just because e.g. one futures contract
had a bad tick that day. (Tune EXIT_NONZERO_ON_ANY_FAILURE below if you
want CI to hard-fail instead.)

Usage:
  python daily_scan.py [--universe universe.json] [--cache-dir data/bars]
                        [--backfill-days 5]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

import cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("daily_scan")

# If True, the process exits with code 1 when any symbol failed, so the
# Actions job shows red. Default False: log the failure clearly but keep
# the job green, since per-symbol isolation means the rest of the scan
# still succeeded and a red job for one bad ticker just causes alert
# fatigue. Flip to True if you'd rather CI fail loudly on any gap.
EXIT_NONZERO_ON_ANY_FAILURE = False

# First-run backfill window when a symbol has no cache yet.
INITIAL_BACKFILL_PERIOD = "1y"
# Small overlap window used for incremental updates, to tolerate
# late-arriving/adjusted bars near the cache's last date.
INCREMENTAL_LOOKBACK_DAYS = 5


def load_universe(path: Path) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    return data["symbols"]


def fetch_bars_for_symbol(entry: dict, cache_dir: Path) -> pd.DataFrame:
    """Fetch the bars needed to bring this symbol's cache up to date.
    Raises on failure — caller is responsible for isolation."""
    ticker = entry["provider_ticker"]
    symbol = entry["symbol"]
    t = yf.Ticker(ticker)

    last_date = cache.last_cached_date(symbol, cache_dir)

    if last_date is None:
        log.info("%s: no cache found, backfilling %s", symbol, INITIAL_BACKFILL_PERIOD)
        hist = t.history(period=INITIAL_BACKFILL_PERIOD, interval="1d")
    else:
        start = last_date - timedelta(days=INCREMENTAL_LOOKBACK_DAYS)
        log.info("%s: cache current through %s, fetching from %s", symbol, last_date, start)
        hist = t.history(start=start.isoformat(), interval="1d")

    if hist is None or hist.empty:
        raise ValueError(f"no data returned for {ticker}")

    hist = hist.reset_index()
    date_col = "Date" if "Date" in hist.columns else "Datetime"
    out = pd.DataFrame({
        "date": pd.to_datetime(hist[date_col]).dt.date,
        "open": hist["Open"],
        "high": hist["High"],
        "low": hist["Low"],
        "close": hist["Close"],
        "volume": hist["Volume"],
    })
    return out.dropna(subset=["close"])


def run_scan(universe_path: Path, cache_dir: Path) -> dict:
    symbols = load_universe(universe_path)
    log.info("Starting daily scan for %d symbols", len(symbols))

    results = {"ok": [], "failed": []}

    for entry in symbols:
        symbol = entry["symbol"]
        try:
            bars = fetch_bars_for_symbol(entry, cache_dir)
            written = cache.append_bars(symbol, bars, cache_dir)
            log.info("%s: OK — %d new row(s) appended", symbol, written)
            results["ok"].append(symbol)
        except Exception as exc:  # noqa: BLE001 — per-symbol isolation is the point
            log.error("%s: FAILED (%s: %s) — skipping, cache untouched", symbol, type(exc).__name__, exc)
            results["failed"].append({"symbol": symbol, "error": f"{type(exc).__name__}: {exc}"})

    log.info(
        "Scan complete: %d/%d succeeded%s",
        len(results["ok"]),
        len(symbols),
        f", failed: {[f['symbol'] for f in results['failed']]}" if results["failed"] else "",
    )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the daily market watchlist scan")
    parser.add_argument("--universe", type=Path, default=Path("universe.json"))
    parser.add_argument("--cache-dir", type=Path, default=cache.DEFAULT_CACHE_DIR)
    args = parser.parse_args()

    if not args.universe.exists():
        log.error("universe file not found: %s", args.universe)
        sys.exit(1)

    results = run_scan(args.universe, args.cache_dir)

    if results["failed"] and EXIT_NONZERO_ON_ANY_FAILURE:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
