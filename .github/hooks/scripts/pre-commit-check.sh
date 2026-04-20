#!/usr/bin/env bash
# pre-commit-check.sh
#
# PreToolUse hook: blocks any `git commit` shell call unless lint and tests pass.
# Receives a JSON payload on stdin describing the tool and its input.
# Outputs a JSON permissionDecision to stdout.

set -euo pipefail

# --- Read and parse stdin ---
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('toolName',''))" 2>/dev/null || echo "")
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('toolInput',{}).get('command',''))" 2>/dev/null || echo "")

# --- Only gate on git commit calls ---
if [[ "$TOOL_NAME" != "run_in_terminal" ]] || ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi

# --- Resolve repo root relative to this script ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

ERRORS=()

# --- Type check ---
if ! npx --yes tsc --noEmit 2>&1; then
  ERRORS+=("Type check failed (npx tsc --noEmit)")
fi

# --- Lint ---
if ! npm run lint 2>&1; then
  ERRORS+=("Lint failed (npm run lint)")
fi

# --- Tests ---
if ! npm run test:ci 2>&1; then
  ERRORS+=("Tests failed (npm run test:ci)")
fi

# --- Decision ---
if [ ${#ERRORS[@]} -eq 0 ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
fi

# Build the denial reason string
REASON="Pre-commit gate failed — fix these before committing:\n"
for ERR in "${ERRORS[@]}"; do
  REASON+="  • $ERR\n"
done

python3 - <<PYEOF
import json, sys
reason = """$REASON"""
payload = {
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason.strip()
    }
}
print(json.dumps(payload))
PYEOF
exit 2
