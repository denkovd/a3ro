/* ────────────────────────────────────────────────────────────────
   DEPRECATED — kept only as a thin alias for backwards compatibility.
   Superseded by GET /api/leaderboard/earnings-beats (architecture
   spec v2, §4). New callers should use that endpoint directly; this
   path just re-exports its GET handler so existing links/bookmarks
   keep working.
──────────────────────────────────────────────────────────────── */

export { GET } from "../../leaderboard/earnings-beats/route";
