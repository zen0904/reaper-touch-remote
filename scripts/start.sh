#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
capture="$project_root/plugin-stream/.build/release/reaper-plugin-stream"
if [ -x "$capture" ]; then "$capture" & capture_pid=$!; trap 'kill "$capture_pid" 2>/dev/null || true' EXIT INT TERM; fi
exec node backend/src/server.js
