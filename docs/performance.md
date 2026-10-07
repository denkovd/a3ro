# Homepage performance

The October 7, 2026 optimization pass reduced Next.js's reported homepage
first-load JavaScript from 173 kB to 146 kB (approximately 16%). This is a
production bundle comparison, not a measured improvement in load time or
Core Web Vitals.

- Homepage cards reserve their dimensions and keep direct platform links
  while their previews load within 400 pixels of the viewport. Loaded cards
  remain mounted so returning to them preserves state.
- Commodity previews load on tab selection. Their destination pages prefetch
  on hover or keyboard focus instead of prefetching all three on mount.
- Public snapshot consumers share in-flight requests and successful responses
  for 15 seconds in the browser. Query strings remain separate. HTTP errors
  and rejected requests are evicted; external feeds, account endpoints, and
  server rendering bypass sharing. Original source timestamps are unchanged.
- Commodity preview animation frames stop when the preview is offscreen or
  the tab is hidden, then resume with one loop when both become visible.

## Verification

Run `npm run test:optimization` for request-sharing, expiry, retry, isolation,
and animation lifecycle tests. Run `npm run build` for the production bundle
report and TypeScript checks.

To verify a production build alongside a development server in PowerShell:

```powershell
$env:A3RO_BUILD_DIR = '.next-optimization'
npm run build
npm run start -- --port 3100
```

Use the same output-folder setting for both commands. The default build folder
remains `.next`; the isolated verification folder is ignored by Git.

Browser checks covered the desktop corridor, deferred card rendering, Gold
tab selection, and the mobile stack and Bitcoin globe at 390 × 844 pixels.
No browser console warnings or errors were recorded during these checks.

The build could not fetch the existing Google Fonts stylesheet in this
environment. Font delivery is unchanged; self-hosted fonts and field
performance measurements remain follow-up work.
