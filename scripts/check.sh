#!/usr/bin/env bash
set -e
set -o pipefail

echo "=== Local gate: build + quicktest + git-check + dual-copy guard ==="

echo "1/4 npm run build"
npm run build

echo "2/4 npm run quicktest (--noinject)"
npm run quicktest

echo "3/4 git diff --check (trailing whitespace)"
git diff --check

echo "4/4 dual-copy resolution guard (tsx spawn must see dist, not src)"
export NODE_OPTIONS='--disable-warning=DEP0205'
RUNNER_RES=$(TSX_TSCONFIG_PATH=tsconfig.tsx.json node --import tsx -e "console.log(import.meta.resolve('genshin-ts/runtime/core'))" 2>/dev/null)
if [[ "$RUNNER_RES" != *"/dist/"* ]]; then
  echo "FAIL: runner-side tsx resolution did not use dist (got $RUNNER_RES)"
  echo "This means .gs.ts runners would import src instead of dist → dual-copy split."
  echo "Verify tsconfig.tsx.json exists and has no paths, and that all tsx spawn sites inject TSX_TSCONFIG_PATH."
  exit 1
fi
echo "PASS: runner resolves to dist ($RUNNER_RES)"

echo ""
echo "✅ All gates passed."
