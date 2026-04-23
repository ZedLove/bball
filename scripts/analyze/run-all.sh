#!/bin/bash
# run-all.sh — Run all capture analysis scripts.
# Usage: scripts/analyze/run-all.sh <capture-dir>
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <capture-dir>"
  echo "Example: $0 captures/2026-04-22-824044"
  exit 1
fi

TICKS="$1/ticks.ndjson"

if [ ! -f "$TICKS" ]; then
  echo "Error: $TICKS not found"
  exit 1
fi

run() {
  local label="$1"
  local script="$2"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $label"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  npx tsx "$script" "$TICKS"
}

run "State Transitions"  scripts/analyze/state-transitions.ts
run "At-Bat Transitions" scripts/analyze/at-bat-transitions.ts
run "Pitcher Stats"      scripts/analyze/pitcher-stats.ts
run "Game End"           scripts/analyze/game-end.ts

echo ""
echo "✓ All analyses complete."
