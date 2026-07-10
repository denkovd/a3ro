"""
cache.py — append-only, per-symbol local bar cache.

Design goals:
- One CSV file per symbol under `cache_dir` (default: ./data/bars/).
  A failure or gap in one symbol's file never touches another symbol's
  file, and a one-day source outage only ever produces a one-day gap
  in that single file — it never truncates or overwrites history.
- Writes are append-only: existing rows are never rewritten. New rows
  are de-duplicated against the last cached date before appending, so
  re-running the scan the same day (or fetching an overlapping range
  for backfill) is always safe to re-run.
- No external dependencies beyond pandas, which the scan pipeline
  already needs for yfinance output.

CSV columns: date,open,high,low,close,volume
`date` is stored as ISO 8601 (YYYY-MM-DD), UTC calendar date of the bar.
"""

from __future__ import annotations

import csv
import os
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import pandas as pd

DEFAULT_CACHE_DIR = Path("data/bars")
CSV_COLUMNS = ["date", "open", "high", "low", "close", "volume"]


def symbol_to_filename(symbol: str) -> str:
    """Map a ticker like 'CL=F' or '^GSPC' to a filesystem-safe filename."""
    safe = symbol.replace("^", "IDX_").replace("=", "_").replace("/", "-")
    return f"{safe}.csv"


def cache_path(symbol: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
    return Path(cache_dir) / symbol_to_filename(symbol)


def ensure_cache_dir(cache_dir: Path = DEFAULT_CACHE_DIR) -> None:
    Path(cache_dir).mkdir(parents=True, exist_ok=True)


def last_cached_date(symbol: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> Optional[date]:
    """Return the most recent date already cached for a symbol, or None
    if the symbol has no cache file yet (first run / previously failed
    every prior day)."""
    path = cache_path(symbol, cache_dir)
    if not path.exists() or path.stat().st_size == 0:
        return None

    last_row = None
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            last_row = row
    if last_row is None:
        return None
    return datetime.strptime(last_row["date"], "%Y-%m-%d").date()


def read_bars(symbol: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> pd.DataFrame:
    """Read the full cached history for a symbol. Returns an empty
    DataFrame with the expected columns if nothing is cached yet."""
    path = cache_path(symbol, cache_dir)
    if not path.exists() or path.stat().st_size == 0:
        return pd.DataFrame(columns=CSV_COLUMNS)
    df = pd.read_csv(path, parse_dates=["date"])
    return df.sort_values("date").reset_index(drop=True)


def append_bars(symbol: str, df: pd.DataFrame, cache_dir: Path = DEFAULT_CACHE_DIR) -> int:
    """Append new bars for a symbol, skipping any date already cached.

    `df` must contain columns: date, open, high, low, close, volume
    (extra columns are dropped; date may be a string, date, or Timestamp).

    Returns the number of new rows actually written.
    """
    ensure_cache_dir(cache_dir)
    path = cache_path(symbol, cache_dir)

    if df is None or df.empty:
        return 0

    work = df.copy()
    work["date"] = pd.to_datetime(work["date"]).dt.strftime("%Y-%m-%d")
    work = work[CSV_COLUMNS].drop_duplicates(subset="date").sort_values("date")

    last_date = last_cached_date(symbol, cache_dir)
    if last_date is not None:
        work = work[pd.to_datetime(work["date"]).dt.date > last_date]

    if work.empty:
        return 0

    write_header = not path.exists() or path.stat().st_size == 0
    with open(path, "a", newline="") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(CSV_COLUMNS)
        for _, row in work.iterrows():
            writer.writerow([row[c] for c in CSV_COLUMNS])

    return len(work)


def cached_symbols(cache_dir: Path = DEFAULT_CACHE_DIR) -> list[str]:
    """List symbols that currently have a cache file (best-effort reverse
    of symbol_to_filename; mainly for diagnostics)."""
    p = Path(cache_dir)
    if not p.exists():
        return []
    return sorted(f.stem for f in p.glob("*.csv"))
