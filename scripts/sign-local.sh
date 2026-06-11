#!/bin/bash
# Ad-hoc sign a locally packaged Smoke.app so it launches via Finder.
#
# Without Developer ID credentials, electron-builder's signing can leave
# the main executable and the nested Electron Framework with mismatched
# identities — dyld then kills the app at launch ("different Team IDs",
# surfaced to the user as "cannot be opened because of a problem").
# A plain `codesign --deep` is unreliable about nesting order; this signs
# every nested bundle bottom-up with the same ad-hoc identity, then the
# outer app.
#
# Usage: scripts/sign-local.sh [path-to-Smoke.app]
#        (defaults to dist/mac-arm64/Smoke.app)
set -euo pipefail

APP="${1:-dist/mac-arm64/Smoke.app}"

if [ ! -d "$APP" ]; then
  echo "error: $APP not found — run 'npm run package:mac' first" >&2
  exit 1
fi

find "$APP/Contents/Frameworks" -depth \
  \( -name "*.framework" -o -name "*.app" -o -name "*.dylib" \) 2>/dev/null \
  | while read -r f; do
      codesign --force --sign - "$f" > /dev/null 2>&1
    done

codesign --force --sign - "$APP" > /dev/null 2>&1
codesign --verify --deep --strict "$APP"
echo "ok: $APP signed consistently (ad-hoc)"
echo "note: first launch after re-signing pays a one-time Gatekeeper scan,"
echo "      and Desktop/Documents privacy grants reset (new signature)."
