import { db } from "../connection.js";

export interface User {
	id: number;
	username: string;
	email: string;
	created_at: string;
}

export const getUserById = db.prepare<User, [number]>("SELECT * FROM users WHERE id = ?");

export const createUser = db.prepare<User, [string, string]>(
	"INSERT INTO users (username, email) VALUES (?, ?) RETURNING *",
);

export const getAllUsers = db.prepare<User, []>("SELECT * FROM users");
