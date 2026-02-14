import type { Setting } from "@polygousse/types";
import { db } from "../connection.js";

export type { Setting } from "@polygousse/types";

export const getSetting = db.prepare<Setting, [string]>("SELECT * FROM settings WHERE key = ?");

export const getAllSettings = db.prepare<Setting, []>("SELECT * FROM settings ORDER BY key");

export const upsertSetting = db.prepare<Setting, [string, string]>(
	"INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at RETURNING *",
);

export const deleteSetting = db.prepare("DELETE FROM settings WHERE key = ?");
