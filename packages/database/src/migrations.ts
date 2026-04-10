import { db } from "./connection.js";

// Migration: add message column if missing
try {
	db.exec("ALTER TABLE claude_sessions ADD COLUMN message TEXT");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add position column to tasks if missing
try {
	db.exec("ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
	// Backfill positions based on created_at order within each workspace
	db.exec(`
    UPDATE tasks SET position = (
      SELECT COUNT(*) FROM tasks t2
      WHERE t2.workspace_id = tasks.workspace_id AND t2.created_at <= tasks.created_at AND t2.id < tasks.id
    )
  `);
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add parent_workspace_id column to workspaces
try {
	db.exec(
		"ALTER TABLE workspaces ADD COLUMN parent_workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE",
	);
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add terminal_session_id to claude_sessions
try {
	db.exec(
		"ALTER TABLE claude_sessions ADD COLUMN terminal_session_id TEXT REFERENCES terminal_sessions(id)",
	);
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: convert old session statuses to new ones
// These UPDATEs are idempotent (no-op when no rows match), so no try/catch needed.
db.exec(`
  UPDATE claude_sessions SET status = 'ongoing' WHERE status = 'active';
  UPDATE claude_sessions SET status = 'waiting_input' WHERE status = 'waiting_for_input';
  UPDATE claude_sessions SET status = 'completed' WHERE status = 'ended';
`);

// Migration: add folderId column to tasks
try {
	db.exec(
		"ALTER TABLE tasks ADD COLUMN folder_id INTEGER REFERENCES task_folders(id) ON DELETE SET NULL",
	);
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: rename camelCase columns to snake_case for consistency
// SQLite supports ALTER TABLE RENAME COLUMN since 3.25.0
try {
	db.exec("ALTER TABLE tasks RENAME COLUMN workspaceId TO workspace_id");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("no such column"))) throw e;
}
try {
	db.exec("ALTER TABLE tasks RENAME COLUMN sessionId TO session_id");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("no such column"))) throw e;
}
try {
	db.exec("ALTER TABLE tasks RENAME COLUMN folderId TO folder_id");
} catch (e) {
	if (
		!(
			e instanceof Error &&
			(e.message.includes("no such column") ||
				e.message.includes("duplicate column"))
		)
	)
		throw e;
}
try {
	db.exec("ALTER TABLE task_folders RENAME COLUMN workspaceId TO workspace_id");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("no such column"))) throw e;
}
try {
	db.exec("ALTER TABLE task_attachments RENAME COLUMN taskId TO task_id");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("no such column"))) throw e;
}

// Migration: drop legacy folderId column (data already in folder_id)
try {
	db.exec("UPDATE tasks SET folder_id = folderId WHERE folder_id IS NULL AND folderId IS NOT NULL");
	db.exec("DROP INDEX IF EXISTS idx_tasks_folderId");
	db.exec("ALTER TABLE tasks DROP COLUMN folderId");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("no such column"))) throw e;
}

// Migration: add linear_team_id column to workspaces
try {
	db.exec("ALTER TABLE workspaces ADD COLUMN linear_team_id TEXT");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add linear_project_ids column to workspaces (JSON array of project IDs)
try {
	db.exec("ALTER TABLE workspaces ADD COLUMN linear_project_ids TEXT");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add completed_at column to tasks
try {
	db.exec("ALTER TABLE tasks ADD COLUMN completed_at TEXT");
	// Backfill: set completed_at for existing done tasks based on created_at
	db.exec("UPDATE tasks SET completed_at = created_at WHERE status = 'done' AND completed_at IS NULL");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add notification_type column to claude_sessions
try {
	db.exec("ALTER TABLE claude_sessions ADD COLUMN notification_type TEXT");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add icon column to workspaces
try {
	db.exec("ALTER TABLE workspaces ADD COLUMN icon TEXT");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add multi_repo column to workspaces
try {
	db.exec("ALTER TABLE workspaces ADD COLUMN multi_repo INTEGER NOT NULL DEFAULT 0");
} catch (e) {
	if (!(e instanceof Error && e.message.includes("duplicate column"))) throw e;
}

// Migration: add indexes on foreign-key and lookup columns
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_folder_id ON tasks(folder_id);
  CREATE INDEX IF NOT EXISTS idx_claude_sessions_terminal_session_id ON claude_sessions(terminal_session_id);
  CREATE INDEX IF NOT EXISTS idx_claude_sessions_status ON claude_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_hook_events_session_id ON hook_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_events_terminal_session_id ON session_events(terminal_session_id);
  CREATE INDEX IF NOT EXISTS idx_ralph_sessions_terminal_session_id ON ralph_sessions(terminal_session_id);
  CREATE INDEX IF NOT EXISTS idx_task_folders_workspace_id ON task_folders(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
  CREATE INDEX IF NOT EXISTS idx_ralph_claude_sessions_claude_session_id ON ralph_claude_sessions(claude_session_id);
  CREATE INDEX IF NOT EXISTS idx_linear_task_links_task_id ON linear_task_links(task_id);
  CREATE INDEX IF NOT EXISTS idx_linear_task_links_linear_issue_id ON linear_task_links(linear_issue_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_linear_task_links_task_id_unique ON linear_task_links(task_id);
`);
