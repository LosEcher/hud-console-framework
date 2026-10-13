#!/bin/bash
CHROME="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
rm -f "$2"
"$CHROME" --headless --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1400,3400 --hide-scrollbars --timeout=25000 --virtual-time-budget=16000 \
  --screenshot="$2" "$1" > /tmp/headless.log 2>&1 &
HPID=$!
for i in $(seq 1 60); do sleep 1; [ -s "$2" ] && break; kill -0 $HPID 2>/dev/null || break; done
kill $HPID 2>/dev/null; pkill -f chrome-headless-shell 2>/dev/null
ls -la "$2" 2>/dev/null | awk '{print $5, $9}'
