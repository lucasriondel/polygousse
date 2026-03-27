<p align="center">
  <img src="apps/web/public/favicon.svg" alt="Polygousse logo" width="128" height="128" />
</p>

# 🧄 Polygousse

A task orchestration platform for running [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI sessions inside tmux terminals, with real-time browser-based terminal visualization, hook event processing, and automated iteration loops.

Polygousse lets you manage tasks, launch Claude Code sessions against them, observe progress in real time through a web UI with embedded terminals, and optionally run automated multi-iteration loops (Ralph) that keep Claude working until a task is done.

## 💡 Motivation

My workflow with Claude Code used to revolve around a `TODO.md` at the root of my project. As I tested my apps and new ideas came up, everything went in there. I'd copy-paste tasks into Claude Code, keep the file in sync, start task in plan mode, run Ralph loops — it worked, but it was tedious.

So I built an app to manage my todos and let me kick off Claude Code sessions with a single click.

I hope you will find it as useful as I do !

## ✨ Features

- 📋 **Task management** -- Create, organize, and track tasks across workspaces with folders and drag-and-drop ordering.
- 📺 **Live terminal streaming** -- Watch Claude Code sessions in real time via xterm.js terminals in the browser.
- 🪝 **Hook event pipeline** -- Ingests Claude Code hook events (tool use, session lifecycle, errors) and broadcasts them over WebSocket for live debugging.
- ⚙️ **Orchestrated workflows** -- State machine orchestrators coordinate multi-step flows like plan-then-implement, PRD extraction, and auto-commit on completion.
- 🔁 **Ralph loop** -- An automated iteration engine that runs Claude Code in a loop with configurable steps (select, implement, verify, update, commit) until the task is complete.
- 🔌 **MCP server** -- Exposes workspace and task management as MCP tools so Claude can interact with Polygousse directly.
- 🔗 **Linear integration** -- Link tasks to Linear issues and sync status.

## 🏗️ Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│   Web UI    │◄──────────────────►│   API Server │
│  (React 19) │   (events + RPC)   │  (Fastify 5) │
└─────────────┘                    └──────┬───────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
              ┌─────▼──────┐       ┌──────▼──────┐      ┌──────▼──────┐
              │   tmux     │       │   SQLite    │      │ PTY Bridge  │
              │ sessions   │       │  (Bun SQL)  │      │ (node-pty)  │
              └─────┬──────┘       └─────────────┘      └─────────────┘
                    │
              ┌─────▼───────┐
              │ Claude Code │──── hook events ────► API /hooks/event
              │    CLI      │
              └─────────────┘
```

## 📁 Project Structure

```
polygousse/
├── apps/
│   ├── api/            # Fastify backend -- session orchestration, hook processing, WebSocket
│   └── web/            # React + Vite frontend -- task UI, live terminals, session debugging
├── packages/
│   ├── cli/            # Hook bridge CLI -- forwards Claude Code hook events to the API
│   ├── database/       # SQLite schema, migrations, and query layer (Bun SQL)
│   ├── mcp-server/     # MCP server exposing Polygousse tools to Claude
│   ├── ralph/          # Ralph loop CLI -- automated multi-iteration task solver
│   ├── types/          # Shared TypeScript types and WebSocket event definitions
│   └── typescript-config/  # Shared tsconfig
├── docs/               # Architecture docs (task execution flows, session statuses)
├── turbo.json          # Turborepo pipeline configuration
└── .env.example        # Environment variable reference
```

## 📦 Prerequisites

- [Bun](https://bun.sh) >= 1.3.4
- [tmux](https://github.com/tmux/tmux) (for terminal session management)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## 🚀 Getting Started

### 1. Install dependencies

```sh
bun install
```

### 2. Configure environment

```sh
cp .env.example .env
# Edit .env if you need to change ports or paths (defaults work out of the box)
```

### 3. Install the Ralph CLI

Link the `ralph` binary so it's available globally:

```sh
cd packages/ralph && bun link && cd ../..
```

### 4. Install Claude Code hooks

Register the Polygousse hook bridge in your Claude Code settings so hook events (session lifecycle, tool use, etc.) are forwarded to the API:

```sh
./scripts/install-hooks.sh
```

This updates `~/.claude/settings.json` to route all Claude Code hook events through the Polygousse CLI. Existing settings (permissions, model, plugins) are preserved.

### 5. Start development servers

```sh
bun run dev
```

This starts both the API server and web UI via Turborepo:

| Service    | Default URL           |
| ---------- | --------------------- |
| Web UI     | http://localhost:5615 |
| API server | http://localhost:5616 |
| PTY bridge | ws://localhost:5617   |

### 6. Create a workspace

Open the web UI and create a workspace pointing to a local project directory. Tasks you create in that workspace will run Claude Code sessions in that directory.

### 7. Add the MCP server to Claude Code (optional)

The Polygousse MCP server exposes workspace and task management as tools, so Claude can list workspaces, list/create/update tasks directly from any Claude Code session.

Add this to your Claude Code MCP configuration (`.mcp.json` at the project root or `~/.claude/settings.json` globally):

```json
{
  "mcpServers": {
    "polygousse": {
      "command": "bun",
      "args": ["/path/to/polygousse/packages/mcp-server/src/index.ts"],
      "type": "stdio"
    }
  }
}
```

Replace `/path/to/polygousse` with the absolute path to your Polygousse clone. Once configured, the following tools become available in Claude Code:

| Tool               | Description                          |
| ------------------ | ------------------------------------ |
| `list_workspaces`  | List all available workspaces        |
| `list_tasks`       | List all tasks in a workspace        |
| `create_task`      | Create a new task in a workspace     |
| `update_task`      | Update a task's title, description, or status |

> **Note:** The MCP server connects to the API when it's running (for real-time WebSocket updates in the UI) and falls back to direct SQLite access when the API is down.

## ⚙️ Configuration

All configuration is done through environment variables. See [`.env.example`](.env.example) for the full reference.

| Variable             | Default                     | Description                               |
| -------------------- | --------------------------- | ----------------------------------------- |
| `PORT`               | `5616`                      | API server port                           |
| `VITE_PORT`          | `5615`                      | Web dev server port                       |
| `PTY_BRIDGE_PORT`    | `5617`                      | PTY bridge WebSocket port                 |
| `POLYGOUSSE_DB_PATH` | `./data/polygousse.db`      | SQLite database path                      |
| `POLYGOUSSE_API_URL` | `http://localhost:5616/api` | API base URL (used by CLI and MCP server) |
| `POLYGOUSSE_LOG_DIR` | `./logs`                    | Directory for daily JSONL log files       |

### 🐛 Debug channels

Enable granular debug logging by setting any of these to `1`:

```sh
POLYGOUSSE_DEBUG_ALL=1              # All channels
POLYGOUSSE_DEBUG_ORCHESTRATOR=1     # State machine transitions
POLYGOUSSE_DEBUG_TASK_LIFECYCLE=1   # Task creation and status changes
POLYGOUSSE_DEBUG_HOOKS=1            # Hook event processing
POLYGOUSSE_DEBUG_WS=1               # WebSocket dispatch
POLYGOUSSE_DEBUG_SETTINGS=1         # Setting reads and writes
```

## 📜 Scripts

Run from the repo root:

```sh
bun run dev         # Start all services in dev mode
bun run build       # Build all packages
bun run typecheck   # Run TypeScript type checking
bun run test        # Run tests
bun run lint        # Lint with Biome
bun run format      # Format with Biome
bun run clean       # Clean build artifacts
```

## 🛠️ Tech Stack

| Layer            | Technology                            |
| ---------------- | ------------------------------------- |
| Backend          | Fastify 5, TypeScript                 |
| Frontend         | React 19, Vite 6, TanStack Router     |
| Database         | SQLite (Bun SQL)                      |
| Real-time        | WebSocket (Fastify + ws)              |
| Terminal         | xterm.js (browser), node-pty (server) |
| State management | Zustand 5                             |
| UI               | Radix UI, Tailwind CSS 4              |
| Monorepo         | Turborepo, Bun workspaces             |
| Linting          | Biome                                 |

## 📄 License

[MIT](LICENSE)
