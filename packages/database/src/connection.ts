import { Database } from "bun:sqlite";
import { resolve } from "node:path";

// Safety: force in-memory DB when running under `bun test` to prevent
// accidental wipes of the production database (e.g. when bunfig.toml
// preload isn't picked up because tests are run from the repo root).
const isBunTest = process.env.NODE_ENV === "test";

const DB_PATH =
	process.env.POLYGOUSSE_DB_PATH ||
	(isBunTest ? ":memory:" : resolve(import.meta.dir, "../../../data/polygousse.db"));

export const db = new Database(DB_PATH, { create: true });

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
