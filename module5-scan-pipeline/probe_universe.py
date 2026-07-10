"""
probe_universe.py — probe-verification for universe.json.

Run this on initial setup and on every deploy (wired into the GitHub
Actions workflow as a pre-flight step). It test-queries every symbol in
universe.json with a tiny, cheap request and reports which symbols
resolve and which don't, so a broken/renamed ticker is caught before it
silently produces gaps in the daily scan.

Exit code:
  0 — all symbols resolved
  1 — one or more symbols failed to resolve (details logged; the run
      that called this script can decide whether to hard-fail or just
      warn — the daily scan itself does NOT depend on a clean probe,
      it isolates failures per symbol regardless)

Usage:
  python probe_universe.py [--universe universe.json] [--verbose]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import yfinance as yf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("probe")


def load_universe(path: Path) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    return data["symbols"]


def probe_symbol(entry: dict) -> tuple[bool, str]:
    """Test-query a single symbol with a minimal request. Returns
    (ok, message)."""
    ticker = entry["provider_ticker"]
    try:
        t = yf.Ticker(ticker)
        # Minimal, cheap probe: last 5 daily bars. Any exception, or an
        # empty/malformed frame, counts as a failed resolve.
        hist = t.history(period="5d", interval="1d")
        if hist is None or hist.empty:
            return False, f"{ticker}: no data returned (empty history)"
        if "Close" not in hist.columns or hist["Close"].isna().all():
            return False, f"{ticker}: history returned but 'Close' is missing/all-NaN"
        last_close = hist["Close"].dropna().iloc[-1]
        return True, f"{ticker}: OK (last close {last_close:.4f}, {len(hist)} bars)"
    except Exception as exc:  # noqa: BLE001 — probe must never crash the batch
        return False, f"{ticker}: FAILED ({type(exc).__name__}: {exc})"


def run_probe(universe_path: Path) -> int:
    symbols = load_universe(universe_path)
    log.info("Probing %d symbols from %s", len(symbols), universe_path)

    failures = []
    for entry in symbols:
        ok, message = probe_symbol(entry)
        if ok:
            log.info(message)
        else:
            log.error(message)
            failures.append(entry["symbol"])

    log.info("Probe complete: %d/%d symbols resolved", len(symbols) - len(failures), len(symbols))

    if failures:
        log.error("FLAGGED symbols (failed to resolve): %s", ", ".join(failures))
        return 1

    log.info("All symbols resolved cleanly.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe-verify every symbol in universe.json")
    parser.add_argument("--universe", type=Path, default=Path("universe.json"))
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    if not args.universe.exists():
        log.error("universe file not found: %s", args.universe)
        sys.exit(1)

    sys.exit(run_probe(args.universe))


if __name__ == "__main__":
    main()
