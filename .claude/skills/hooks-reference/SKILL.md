---
name: hooks-reference
description: "Claude Code hooks reference and implementation guide. Use when user asks about hooks, wants to create/configure/debug hooks, asks about hook events (SessionStart, PreToolUse, PostToolUse, Stop, etc.), or needs help with hook lifecycle, matchers, JSON input/output, exit codes, async hooks, prompt hooks, or agent hooks."
tools: Read, Glob, Grep, Bash, Write, Edit
---

# Claude Code Hooks Reference

Complete reference for creating, configuring, and debugging Claude Code hooks.

## Quick Reference

Hooks are user-defined shell commands or LLM prompts that execute automatically at specific points in Claude Code's lifecycle.

### Hook Events Summary

| Event | When it fires | Can block? |
|---|---|---|
| `SessionStart` | Session begins/resumes | No |
| `UserPromptSubmit` | User submits prompt, before processing | Yes |
| `PreToolUse` | Before tool call executes | Yes |
| `PermissionRequest` | Permission dialog appears | Yes |
| `PostToolUse` | After tool call succeeds | No (tool already ran) |
| `PostToolUseFailure` | After tool call fails | No |
| `Notification` | Claude sends notification | No |
| `SubagentStart` | Subagent spawned | No |
| `SubagentStop` | Subagent finishes | Yes |
| `Stop` | Claude finishes responding | Yes |
| `TeammateIdle` | Teammate about to go idle | Yes |
| `TaskCompleted` | Task being marked completed | Yes |
| `PreCompact` | Before context compaction | No |
| `SessionEnd` | Session terminates | No |

### Hook Types

| Type | Description |
|---|---|
| `command` | Runs a shell command. Receives JSON on stdin, communicates via exit codes + stdout |
| `prompt` | Single-turn LLM evaluation. Returns `{ "ok": true/false, "reason": "..." }` |
| `agent` | Multi-turn subagent with tool access. Same response format as prompt |

### Exit Code Behavior

| Exit code | Meaning |
|---|---|
| `0` | Success - action proceeds. JSON on stdout is parsed for structured control |
| `2` | Blocking error - action is prevented. stderr is fed back as error message |
| Other | Non-blocking error - action proceeds. stderr logged in verbose mode |

## Configuration Structure

Three levels of nesting:

```json
{
  "hooks": {
    "<HookEvent>": [           // 1. Choose event
      {
        "matcher": "<regex>",   // 2. Filter when it fires
        "hooks": [              // 3. Define handlers
          {
            "type": "command",
            "command": "your-script.sh",
            "timeout": 600,
            "async": false
          }
        ]
      }
    ]
  }
}
```

### Hook Locations

| Location | Scope | Shareable |
|---|---|---|
| `~/.claude/settings.json` | All projects | No |
| `.claude/settings.json` | Single project | Yes (commit to repo) |
| `.claude/settings.local.json` | Single project | No (gitignored) |
| Managed policy settings | Organization-wide | Yes |
| Plugin `hooks/hooks.json` | When plugin enabled | Yes |
| Skill/agent frontmatter | While component active | Yes |

### Matcher Patterns

| Event | What matcher filters | Example values |
|---|---|---|
| Tool events (`PreToolUse`, `PostToolUse`, etc.) | tool name | `Bash`, `Edit\|Write`, `mcp__.*` |
| `SessionStart` | how session started | `startup`, `resume`, `clear`, `compact` |
| `SessionEnd` | why session ended | `clear`, `logout`, `prompt_input_exit` |
| `Notification` | notification type | `permission_prompt`, `idle_prompt` |
| `SubagentStart`/`SubagentStop` | agent type | `Bash`, `Explore`, `Plan` |
| `PreCompact` | trigger type | `manual`, `auto` |
| `UserPromptSubmit`, `Stop`, `TeammateIdle`, `TaskCompleted` | no matcher | always fires |

## Common Input Fields (all events)

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

## Decision Control Patterns

| Events | Pattern | Key fields |
|---|---|---|
| `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStop` | Top-level `decision` | `decision: "block"`, `reason` |
| `TeammateIdle`, `TaskCompleted` | Exit code only | Exit 2 blocks, stderr is feedback |
| `PreToolUse` | `hookSpecificOutput` | `permissionDecision` (allow/deny/ask), `permissionDecisionReason` |
| `PermissionRequest` | `hookSpecificOutput` | `decision.behavior` (allow/deny) |

### Universal JSON Output Fields

| Field | Default | Description |
|---|---|---|
| `continue` | `true` | If `false`, Claude stops entirely |
| `stopReason` | none | Message shown to user when `continue` is `false` |
| `suppressOutput` | `false` | If `true`, hides stdout from verbose mode |
| `systemMessage` | none | Warning message shown to user |

## Implementation Workflow

When creating hooks, follow this process:

1. **Identify the event** - Which lifecycle point do you need?
2. **Define the matcher** - What should trigger it? (tool name, session type, etc.)
3. **Choose handler type** - Command for scripts, prompt for LLM judgment, agent for multi-turn verification
4. **Write the handler** - Parse JSON input, perform action, return appropriate exit code/JSON
5. **Choose location** - Project-scoped (`.claude/settings.json`) or global (`~/.claude/settings.json`)
6. **Test** - Use `claude --debug` or `Ctrl+O` verbose mode

## Full Reference Documentation

See [references/hooks-full-reference.md](references/hooks-full-reference.md) for complete event schemas, all JSON input/output formats, tool input schemas, async hooks, prompt/agent hooks, environment variables, and security considerations.

See [references/hooks-guide.md](references/hooks-guide.md) for practical examples and common automation patterns (notifications, auto-formatting, file protection, context re-injection).

## Common Patterns

### Auto-format on edit

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

### Block protected files

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"
          }
        ]
      }
    ]
  }
}
```

### Desktop notifications

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

### Re-inject context after compaction

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Reminder: use Bun, not npm. Run bun test before committing.'"
          }
        ]
      }
    ]
  }
}
```

### Prompt-based Stop hook

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all tasks are complete. Context: $ARGUMENTS. Respond with {\"ok\": true} or {\"ok\": false, \"reason\": \"what remains\"}."
          }
        ]
      }
    ]
  }
}
```

### Agent-based verification

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify all unit tests pass. Run the test suite and check results. $ARGUMENTS",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

### Async background hook

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

### Hooks in skill/agent frontmatter

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

## Troubleshooting

| Problem | Solution |
|---|---|
| Hook not firing | Check `/hooks` menu, verify matcher case-sensitivity, confirm correct event type |
| JSON validation failed | Shell profile printing text - wrap echo in `if [[ $- == *i* ]]` check |
| Stop hook loops forever | Check `stop_hook_active` field and exit 0 if true |
| Hook error in output | Test manually: `echo '{"tool_name":"Bash"}' \| ./hook.sh` |
| PermissionRequest not firing | Doesn't fire in headless mode (`-p`), use PreToolUse instead |

## Debugging

- `claude --debug` - Full hook execution details
- `Ctrl+O` - Toggle verbose mode to see hook output in transcript
- Test hooks manually by piping JSON to your script
