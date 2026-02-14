# Read App Logs

Search and analyze Polygousse's structured JSONL log files.

## Log File Location

- Default directory: `apps/api/logs/`
- Override: `POLYGOUSSE_LOG_DIR` env var
- Files are named `polygousse-YYYY-MM-DD.log` (one per day, rotates at midnight)

## JSONL Schema

Each line is a JSON object with these fields:

| Field     | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `ts`      | string | ISO 8601 timestamp                   |
| `level`   | string | `info`, `debug`, `warn`, `error`     |
| `cat`     | string | Category (e.g. `hook`, `orchestrator`, `ws`, `tmux`, `task`) |
| `event`   | string | Specific event name (optional)       |
| `sid`     | string | Claude session ID (optional)         |
| `tid`     | string | Terminal session ID (optional)       |
| `taskId`  | number | Task ID (optional)                   |
| `msg`     | string | Human-readable message               |
| `data`    | object | Extra payload (optional)             |

## Common Search Patterns

Use `grep` or `jq` from the `apps/api` directory. Today's log file is `logs/polygousse-$(date +%F).log`.

### By task ID
```bash
grep '"taskId":42' logs/polygousse-2026-03-09.log
# or with jq for pretty output:
cat logs/polygousse-2026-03-09.log | jq -c 'select(.taskId == 42)'
```

### By category
```bash
grep '"cat":"hook"' logs/polygousse-*.log
grep '"cat":"orchestrator"' logs/polygousse-*.log
```

### Errors only
```bash
grep '"level":"error"' logs/polygousse-*.log
```

### By session ID
```bash
grep '"sid":"SESSION_ID_HERE"' logs/polygousse-*.log
```

### By terminal session
```bash
grep '"tid":"TERMINAL_ID_HERE"' logs/polygousse-*.log
```

### Recent entries (last 50 lines of today's log)
```bash
tail -50 logs/polygousse-$(date +%F).log | jq .
```

### Search across multiple days
```bash
# All errors from the last 3 days
cat logs/polygousse-2026-03-{07,08,09}.log | jq -c 'select(.level == "error")'

# All logs matching a pattern across all days
grep '"taskId":42' logs/polygousse-*.log
```

### Time range (within a single day)
```bash
cat logs/polygousse-2026-03-09.log | jq -c 'select(.ts >= "2026-03-09T10:00" and .ts <= "2026-03-09T11:00")'
```

## Correlation Workflow

To trace a full task lifecycle:

1. Find the task: `grep '"taskId":42' logs/polygousse-*.log | head -5`
2. Get the terminal session ID (`tid`) from the result
3. Trace terminal activity: `grep '"tid":"THE_TID"' logs/polygousse-*.log`
4. Get the Claude session ID (`sid`) from the result
5. Trace Claude session: `grep '"sid":"THE_SID"' logs/polygousse-*.log`

## Categories Reference

| Category        | Source                        | Events logged                              |
|-----------------|-------------------------------|--------------------------------------------|
| `hook`          | `pretty-log.ts`               | Hook events (SessionStart, etc.)           |
| `orchestrator`  | `orchestrator.ts`             | State machine transitions, errors          |
| `ws`            | `ws/index.ts`, `ws/handlers.ts` | Broadcasts, action dispatch              |
| `task`          | `services/start-task/*`       | Task routing, start decisions              |
| `task-completion` | `services/task-completion.ts` | Teardown, DB cleanup                     |
| `tmux`          | `tmux.ts`                     | sendKeys calls with command length         |
| `hook-processing` | `services/hook-processing/*` | Task/status resolution from hooks        |

## Tips

- The log file is append-only JSONL — one JSON object per line, no commas between entries
- Debug-level messages are always written to file even when `POLYGOUSSE_DEBUG_*` env vars are unset
- Buffer flushes every 100ms, so there may be a brief delay before entries appear
- Use `jq -c` for compact output or `jq .` for pretty-printed output
- Old log files can be safely deleted or compressed — each day is independent
