import { db } from "../connection.js";

export type { TaskAttachment } from "@polygousse/types";

import type { TaskAttachment } from "@polygousse/types";

export const getAttachmentsByTaskId = db.prepare<TaskAttachment, [number]>(
	"SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC",
);

export const getAllAttachments = db.prepare<TaskAttachment, []>(
	"SELECT * FROM task_attachments ORDER BY created_at ASC",
);

export const getAttachmentById = db.prepare<TaskAttachment, [number]>(
	"SELECT * FROM task_attachments WHERE id = ?",
);

export const createAttachment = db.prepare<
	TaskAttachment,
	[number, string, string, string, number]
>(
	"INSERT INTO task_attachments (task_id, filename, stored_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?) RETURNING *",
);

export const deleteAttachment = db.prepare("DELETE FROM task_attachments WHERE id = ?");

export const deleteAttachmentsByTaskId = db.prepare(
	"DELETE FROM task_attachments WHERE task_id = ?",
);
