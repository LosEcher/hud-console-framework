#!/bin/bash
# Browser: set $CHROME, otherwise the first of google-chrome / chromium / chrome-headless-shell on PATH,
# otherwise the Playwright headless shell under $PLAYWRIGHT_BROWSERS_PATH (macOS default cache).
if [ -z "$CHROME" ]; then
  for c in google-chrome chromium chromium-browser chrome-headless-shell; do command -v "$c" >/dev/null && CHROME=$(command -v "$c") && break; done
fi
if [ -z "$CHROME" ]; then
  PW="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
  CHROME=$(ls -d "$PW"/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell 2>/dev/null | tail -1)
fi
[ -x "$CHROME" ] || { echo "no headless Chrome found; set CHROME=/path/to/chrome" >&2; exit 1; }
SIZE="${SIZE:-1400,3400}"
rm -f "$2"
"$CHROME" --headless --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size="$SIZE" --hide-scrollbars --timeout=25000 --virtual-time-budget=16000 \
  --screenshot="$2" "$1" > /tmp/headless.log 2>&1 &
HPID=$!
for i in $(seq 1 60); do sleep 1; [ -s "$2" ] && break; kill -0 $HPID 2>/dev/null || break; done
kill $HPID 2>/dev/null; 
ls -la "$2" 2>/dev/null | awk '{print $5, $9}'
