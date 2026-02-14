# Hooks Full Reference

Complete event schemas, JSON input/output formats, and advanced features.

Source: https://code.claude.com/docs/en/hooks.md

## Hook Handler Fields

### Common Fields (all types)

| Field | Required | Description |
|---|---|---|
| `type` | yes | `"command"`, `"prompt"`, or `"agent"` |
| `timeout` | no | Seconds before canceling. Defaults: 600 (command), 30 (prompt), 60 (agent) |
| `statusMessage` | no | Custom spinner message while hook runs |
| `once` | no | If `true`, runs only once per session. Skills only |

### Command Hook Fields

| Field | Required | Description |
|---|---|---|
| `command` | yes | Shell command to execute |
| `async` | no | If `true`, runs in background without blocking |

### Prompt and Agent Hook Fields

| Field | Required | Description |
|---|---|---|
| `prompt` | yes | Prompt text. Use `$ARGUMENTS` for hook input JSON placeholder |
| `model` | no | Model to use. Defaults to a fast model |

## Event Schemas

### SessionStart

**Matcher values**: `startup`, `resume`, `clear`, `compact`

**Input fields** (in addition to common fields):

| Field | Description |
|---|---|
| `source` | How session started: `startup`, `resume`, `clear`, `compact` |
| `model` | Model identifier |
| `agent_type` | Agent name if started with `claude --agent <name>` (optional) |

**Decision control**:

| Field | Description |
|---|---|
| `additionalContext` | String added to Claude's context |

**Environment**: Has access to `CLAUDE_ENV_FILE` for persisting env vars.

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

### UserPromptSubmit

**Matcher**: Not supported (always fires).

**Input fields**:

| Field | Description |
|---|---|
| `prompt` | The text the user submitted |

**Decision control**:

| Field | Description |
|---|---|
| `decision` | `"block"` prevents prompt processing and erases it |
| `reason` | Shown to user when blocking |
| `additionalContext` | String added to Claude's context |

Plain text stdout is also added as context. JSON format not required for simple cases.

### PreToolUse

**Matcher**: Tool name (`Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Task`, `WebFetch`, `WebSearch`, MCP tools)

**Input fields**:

| Field | Description |
|---|---|
| `tool_name` | Name of the tool |
| `tool_input` | Tool-specific arguments (see below) |
| `tool_use_id` | Unique tool call identifier |

**Tool input schemas**:

#### Bash
| Field | Type | Description |
|---|---|---|
| `command` | string | Shell command to execute |
| `description` | string | Optional description |
| `timeout` | number | Optional timeout in ms |
| `run_in_background` | boolean | Whether to run in background |

#### Write
| Field | Type | Description |
|---|---|---|
| `file_path` | string | Absolute path |
| `content` | string | Content to write |

#### Edit
| Field | Type | Description |
|---|---|---|
| `file_path` | string | Absolute path |
| `old_string` | string | Text to find |
| `new_string` | string | Replacement text |
| `replace_all` | boolean | Replace all occurrences |

#### Read
| Field | Type | Description |
|---|---|---|
| `file_path` | string | Absolute path |
| `offset` | number | Optional start line |
| `limit` | number | Optional line count |

#### Glob
| Field | Type | Description |
|---|---|---|
| `pattern` | string | Glob pattern |
| `path` | string | Optional directory |

#### Grep
| Field | Type | Description |
|---|---|---|
| `pattern` | string | Regex pattern |
| `path` | string | Optional directory |
| `glob` | string | Optional file filter |
| `output_mode` | string | `content`, `files_with_matches`, `count` |
| `-i` | boolean | Case insensitive |
| `multiline` | boolean | Multiline matching |

#### WebFetch
| Field | Type | Description |
|---|---|---|
| `url` | string | URL to fetch |
| `prompt` | string | Prompt for content processing |

#### WebSearch
| Field | Type | Description |
|---|---|---|
| `query` | string | Search query |
| `allowed_domains` | array | Optional domain whitelist |
| `blocked_domains` | array | Optional domain blacklist |

#### Task
| Field | Type | Description |
|---|---|---|
| `prompt` | string | Task for the agent |
| `description` | string | Short description |
| `subagent_type` | string | Agent type |
| `model` | string | Optional model override |

**Decision control** (via `hookSpecificOutput`):

| Field | Description |
|---|---|
| `permissionDecision` | `"allow"` (bypass permissions), `"deny"` (block), `"ask"` (prompt user) |
| `permissionDecisionReason` | For allow/ask: shown to user. For deny: shown to Claude |
| `updatedInput` | Modifies tool input before execution |
| `additionalContext` | String added to Claude's context |

### PermissionRequest

**Matcher**: Tool name (same as PreToolUse)

**Input fields**: Same as PreToolUse but without `tool_use_id`. Also includes `permission_suggestions` array.

**Decision control** (via `hookSpecificOutput.decision`):

| Field | Description |
|---|---|
| `behavior` | `"allow"` or `"deny"` |
| `updatedInput` | For allow: modifies tool input |
| `updatedPermissions` | For allow: applies permission rules |
| `message` | For deny: tells Claude why |
| `interrupt` | For deny: if `true`, stops Claude |

### PostToolUse

**Matcher**: Tool name

**Input fields**: `tool_name`, `tool_input`, `tool_response`, `tool_use_id`

**Decision control**:

| Field | Description |
|---|---|
| `decision` | `"block"` prompts Claude with the reason |
| `reason` | Shown to Claude when blocking |
| `additionalContext` | Additional context for Claude |
| `updatedMCPToolOutput` | For MCP tools only: replaces tool output |

### PostToolUseFailure

**Matcher**: Tool name

**Input fields**: `tool_name`, `tool_input`, `tool_use_id`, `error` (string), `is_interrupt` (optional boolean)

**Decision control**:

| Field | Description |
|---|---|
| `additionalContext` | Additional context alongside the error |

### Notification

**Matcher**: Notification type (`permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`)

**Input fields**: `message`, `title` (optional), `notification_type`

**Decision control**: Cannot block. Can return `additionalContext`.

### SubagentStart

**Matcher**: Agent type (`Bash`, `Explore`, `Plan`, custom names)

**Input fields**: `agent_id`, `agent_type`

**Decision control**: Cannot block. Can return `additionalContext` (added to subagent's context).

### SubagentStop

**Matcher**: Agent type

**Input fields**: `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`

**Decision control**: Same as Stop hooks (`decision: "block"`, `reason`).

### Stop

**Matcher**: Not supported (always fires).

**Input fields**: `stop_hook_active` (boolean - true when already continuing from a stop hook)

**Decision control**:

| Field | Description |
|---|---|
| `decision` | `"block"` prevents Claude from stopping |
| `reason` | Required when blocking. Tells Claude why to continue |

**Important**: Check `stop_hook_active` to prevent infinite loops.

### TeammateIdle

**Matcher**: Not supported.

**Input fields**: `teammate_name`, `team_name`

**Decision control**: Exit code 2 only. stderr is feedback to teammate.

### TaskCompleted

**Matcher**: Not supported.

**Input fields**: `task_id`, `task_subject`, `task_description` (optional), `teammate_name` (optional), `team_name` (optional)

**Decision control**: Exit code 2 only. stderr is feedback to model.

### PreCompact

**Matcher**: `manual`, `auto`

**Input fields**: `trigger`, `custom_instructions`

**Decision control**: None.

### SessionEnd

**Matcher**: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other`

**Input fields**: `reason`

**Decision control**: None. Cannot block session termination.

## MCP Tool Matching

MCP tools follow the pattern `mcp__<server>__<tool>`:
- `mcp__memory__create_entities`
- `mcp__filesystem__read_file`
- `mcp__github__search_repositories`

Regex examples:
- `mcp__memory__.*` - all memory server tools
- `mcp__.*__write.*` - any write tool from any server

## Async Hooks

Set `"async": true` on command hooks to run in background.

- Only `type: "command"` supports async
- Cannot block or return decisions
- Output delivered on next conversation turn via `systemMessage` or `additionalContext`
- Each execution is a separate background process

## Prompt-Based Hooks

Supported events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `TaskCompleted`.

Response schema:
```json
{ "ok": true }
// or
{ "ok": false, "reason": "explanation" }
```

## Agent-Based Hooks

Same events as prompt hooks. Can use Read, Grep, Glob tools. Up to 50 turns. Default timeout 60s.

Same response schema as prompt hooks.

## Environment Variables

| Variable | Description |
|---|---|
| `$CLAUDE_PROJECT_DIR` | Project root directory |
| `${CLAUDE_PLUGIN_ROOT}` | Plugin root directory |
| `$CLAUDE_ENV_FILE` | File path for persisting env vars (SessionStart only) |
| `$CLAUDE_CODE_REMOTE` | `"true"` in remote web environments |

## Security Best Practices

- Validate and sanitize inputs
- Always quote shell variables: `"$VAR"` not `$VAR`
- Block path traversal: check for `..` in file paths
- Use absolute paths with `$CLAUDE_PROJECT_DIR`
- Skip sensitive files: `.env`, `.git/`, keys
