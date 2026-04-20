#!/usr/bin/env bash
# auto-format.sh
#
# PostToolUse hook: auto-formats files after any file edit tool succeeds.
# Runs npm run format to ensure code is always formatted, preventing formatting
# from ever being a blocker for the pre-commit gate.
#
# Receives a JSON payload on stdin describing the tool that just ran.
# Always exits 0 (non-blocking) and optionally returns a systemMessage for the agent.

set -euo pipefail

# --- Read and parse stdin ---
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('toolName',''))" 2>/dev/null || echo "")

# --- Only format after file-edit tools ---
FILE_EDIT_TOOLS=("create_file" "replace_string_in_file" "multi_replace_string_in_file" "edit_notebook_file")

SHOULD_FORMAT=0
for TOOL in "${FILE_EDIT_TOOLS[@]}"; do
  if [[ "$TOOL_NAME" == "$TOOL" ]]; then
    SHOULD_FORMAT=1
    break
  fi
done

# If not a file-edit tool, pass through silently
if [ $SHOULD_FORMAT -eq 0 ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse"}}'
  exit 0
fi

# --- Resolve repo root relative to this script ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

# --- Run format (non-blocking: always exit 0) ---
if npm run format 2>&1 >/dev/null; then
  SYSTEM_MSG="Auto-formatted code with \`npm run format\`."
else
  SYSTEM_MSG="Attempted to auto-format with \`npm run format\`, but encountered an error. You may need to run it manually."
fi

# --- Return systemMessage for agent awareness ---
python3 - <<PYEOF
import json
payload = {
    "hookSpecificOutput": {
        "hookEventName": "PostToolUse"
    },
    "systemMessage": "$SYSTEM_MSG"
}
print(json.dumps(payload))
PYEOF
exit 0
