#!/usr/bin/env bash
# Overrides ~/.claude/settings.json hooks to point to polygousse CLI.
# Preserves all other existing settings (permissions, model, plugins, etc).

set -euo pipefail

SETTINGS_FILE="$HOME/.claude/settings.json"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI_SCRIPT="$PROJECT_DIR/packages/cli/src/index.ts"
HOOK_CMD="bun \"$CLI_SCRIPT\""

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "Error: $SETTINGS_FILE not found"
  exit 1
fi

# Use jq to merge hooks into the existing settings, preserving everything else
jq --arg cmd "$HOOK_CMD" '

def hook: { "type": "command", "command": $cmd, "async": true, "timeout": 10 };
def entry: [{ "hooks": [ hook ] }];
def entry_with_matcher(m): [{ "matcher": m, "hooks": [ hook ] }];

.hooks = {
  "SessionStart":        entry,
  "UserPromptSubmit":    entry,
  "PreToolUse":          entry,
  "PermissionRequest":   entry,
  "PostToolUse":         entry,
  "PostToolUseFailure":  entry,
  "Notification":        entry,
  "SubagentStart":       entry,
  "SubagentStop":        entry,
  "Stop":                entry,
  "TeammateIdle":        entry,
  "TaskCompleted":       entry,
  "PreCompact":          entry,
  "SessionEnd":          entry
}
' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"

echo "Hooks installed in $SETTINGS_FILE"
echo "CLI script: $CLI_SCRIPT"
