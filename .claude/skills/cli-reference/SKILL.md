---
name: cli-reference
description: "Claude Code CLI reference. Use when user asks about CLI commands, flags, options, command-line usage, print mode, system prompt flags, output formats, session management flags, permission modes, MCP config, --agents flag, or any claude CLI invocation syntax."
tools: Read
---

# Claude Code CLI Reference

Complete reference for Claude Code command-line interface, including commands and flags.

## CLI Commands

| Command | Description | Example |
|:--|:--|:--|
| `claude` | Start interactive REPL | `claude` |
| `claude "query"` | Start REPL with initial prompt | `claude "explain this project"` |
| `claude -p "query"` | Query via SDK, then exit | `claude -p "explain this function"` |
| `cat file \| claude -p "query"` | Process piped content | `cat logs.txt \| claude -p "explain"` |
| `claude -c` | Continue most recent conversation in current directory | `claude -c` |
| `claude -c -p "query"` | Continue via SDK | `claude -c -p "Check for type errors"` |
| `claude -r "<session>" "query"` | Resume session by ID or name | `claude -r "auth-refactor" "Finish this PR"` |
| `claude update` | Update to latest version | `claude update` |
| `claude mcp` | Configure Model Context Protocol servers | See MCP documentation |

## CLI Flags

| Flag | Description | Example |
|:--|:--|:--|
| `--add-dir` | Add additional working directories | `claude --add-dir ../apps ../lib` |
| `--agent` | Specify an agent for the current session | `claude --agent my-custom-agent` |
| `--agents` | Define custom subagents dynamically via JSON | See agents format below |
| `--allow-dangerously-skip-permissions` | Enable permission bypassing as an option without activating it | `claude --permission-mode plan --allow-dangerously-skip-permissions` |
| `--allowedTools` | Tools that execute without prompting for permission | `"Bash(git log *)" "Read"` |
| `--append-system-prompt` | Append custom text to end of default system prompt | `claude --append-system-prompt "Always use TypeScript"` |
| `--append-system-prompt-file` | Load additional system prompt from file (print mode only) | `claude -p --append-system-prompt-file ./extra-rules.txt "query"` |
| `--betas` | Beta headers for API requests (API key users only) | `claude --betas interleaved-thinking` |
| `--chrome` | Enable Chrome browser integration | `claude --chrome` |
| `--continue`, `-c` | Load most recent conversation in current directory | `claude --continue` |
| `--dangerously-skip-permissions` | Skip all permission prompts (use with caution) | `claude --dangerously-skip-permissions` |
| `--debug` | Enable debug mode with optional category filtering | `claude --debug "api,mcp"` |
| `--disable-slash-commands` | Disable all skills and slash commands | `claude --disable-slash-commands` |
| `--disallowedTools` | Tools removed from model context, cannot be used | `"Bash(git log *)" "Edit"` |
| `--fallback-model` | Fallback model when default is overloaded (print mode only) | `claude -p --fallback-model sonnet "query"` |
| `--fork-session` | Create new session ID when resuming | `claude --resume abc123 --fork-session` |
| `--from-pr` | Resume sessions linked to a GitHub PR | `claude --from-pr 123` |
| `--ide` | Auto-connect to IDE on startup | `claude --ide` |
| `--init` | Run initialization hooks and start interactive mode | `claude --init` |
| `--init-only` | Run initialization hooks and exit | `claude --init-only` |
| `--include-partial-messages` | Include partial streaming events (requires `--print` and `--output-format=stream-json`) | `claude -p --output-format stream-json --include-partial-messages "query"` |
| `--input-format` | Input format for print mode (`text`, `stream-json`) | `claude -p --output-format json --input-format stream-json` |
| `--json-schema` | Get validated JSON output matching a schema (print mode only) | `claude -p --json-schema '{"type":"object",...}' "query"` |
| `--maintenance` | Run maintenance hooks and exit | `claude --maintenance` |
| `--max-budget-usd` | Max dollar amount for API calls (print mode only) | `claude -p --max-budget-usd 5.00 "query"` |
| `--max-turns` | Limit agentic turns (print mode only) | `claude -p --max-turns 3 "query"` |
| `--mcp-config` | Load MCP servers from JSON files or strings | `claude --mcp-config ./mcp.json` |
| `--model` | Set model for session (alias or full name) | `claude --model claude-sonnet-4-6` |
| `--no-chrome` | Disable Chrome browser integration | `claude --no-chrome` |
| `--no-session-persistence` | Disable session persistence (print mode only) | `claude -p --no-session-persistence "query"` |
| `--output-format` | Output format for print mode (`text`, `json`, `stream-json`) | `claude -p "query" --output-format json` |
| `--permission-mode` | Begin in a specified permission mode | `claude --permission-mode plan` |
| `--permission-prompt-tool` | MCP tool to handle permission prompts in non-interactive mode | `claude -p --permission-prompt-tool mcp_auth_tool "query"` |
| `--plugin-dir` | Load plugins from directories (repeatable) | `claude --plugin-dir ./my-plugins` |
| `--print`, `-p` | Print response without interactive mode | `claude -p "query"` |
| `--remote` | Create a new web session on claude.ai | `claude --remote "Fix the login bug"` |
| `--resume`, `-r` | Resume a specific session by ID or name | `claude --resume auth-refactor` |
| `--session-id` | Use a specific session ID (must be valid UUID) | `claude --session-id "550e8400-..."` |
| `--setting-sources` | Comma-separated setting sources (`user`, `project`, `local`) | `claude --setting-sources user,project` |
| `--settings` | Path to settings JSON file or JSON string | `claude --settings ./settings.json` |
| `--strict-mcp-config` | Only use MCP servers from `--mcp-config` | `claude --strict-mcp-config --mcp-config ./mcp.json` |
| `--system-prompt` | Replace entire system prompt with custom text | `claude --system-prompt "You are a Python expert"` |
| `--system-prompt-file` | Load system prompt from file (print mode only) | `claude -p --system-prompt-file ./prompt.txt "query"` |
| `--teleport` | Resume a web session in local terminal | `claude --teleport` |
| `--teammate-mode` | Agent team teammate display mode (`auto`, `in-process`, `tmux`) | `claude --teammate-mode in-process` |
| `--tools` | Restrict which built-in tools Claude can use | `claude --tools "Bash,Edit,Read"` |
| `--verbose` | Enable verbose logging | `claude --verbose` |
| `--version`, `-v` | Output the version number | `claude -v` |

## --agents Flag Format

The `--agents` flag accepts a JSON object defining custom subagents. Each subagent needs a unique name key with these fields:

| Field | Required | Description |
|:--|:--|:--|
| `description` | Yes | When the subagent should be invoked |
| `prompt` | Yes | System prompt guiding the subagent |
| `tools` | No | Array of tools (e.g. `["Read", "Edit", "Bash"]`). Inherits all if omitted |
| `disallowedTools` | No | Array of tool names to deny |
| `model` | No | `sonnet`, `opus`, `haiku`, or `inherit` (default) |
| `skills` | No | Array of skill names to preload |
| `mcpServers` | No | Array of MCP servers for this subagent |
| `maxTurns` | No | Maximum agentic turns before stopping |

Example:

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer. Use proactively after code changes.",
    "prompt": "You are a senior code reviewer. Focus on code quality, security, and best practices.",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  },
  "debugger": {
    "description": "Debugging specialist for errors and test failures.",
    "prompt": "You are an expert debugger. Analyze errors, identify root causes, and provide fixes."
  }
}'
```

## System Prompt Flags

| Flag | Behavior | Modes | Use Case |
|:--|:--|:--|:--|
| `--system-prompt` | **Replaces** entire default prompt | Interactive + Print | Complete control over Claude's behavior |
| `--system-prompt-file` | **Replaces** with file contents | Print only | Load prompts from files |
| `--append-system-prompt` | **Appends** to default prompt | Interactive + Print | Add instructions while keeping defaults |
| `--append-system-prompt-file` | **Appends** file contents | Print only | Load additional instructions from files |

- `--system-prompt` and `--system-prompt-file` are mutually exclusive
- The append flags can be used together with either replacement flag
- For most use cases, `--append-system-prompt` is recommended as it preserves Claude Code's built-in capabilities
