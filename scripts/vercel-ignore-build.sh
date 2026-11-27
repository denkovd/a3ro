#!/bin/sh
# Vercel "Ignored Build Step": exit 0 skips the deploy, exit 1 builds.
# Skip only when every file in the commit is under module5-scan-pipeline/data
# (the daily bar cache, which the site never reads). Anything unclear builds.
git rev-parse -q --verify HEAD^ >/dev/null 2>&1 || exit 1
changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null) || exit 1
[ -n "$changed" ] || exit 1
if printf '%s\n' "$changed" | grep -qv '^module5-scan-pipeline/data/'; then exit 1; fi
echo "Only the bar cache changed: skipping this deploy."
exit 0
