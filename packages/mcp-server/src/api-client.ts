import type { Task } from "@polygousse/types";

const API_URL = process.env.POLYGOUSSE_API_URL ?? "http://localhost:5616/api";

export async function createTaskViaApi(
	workspaceId: number,
	title: string,
	description?: string,
	status?: string,
	folderId?: number,
): Promise<Task | null> {
	try {
		const res = await fetch(`${API_URL}/workspaces/${workspaceId}/tasks`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title, description, status, folderId }),
		});
		if (!res.ok) return null;
		return (await res.json()) as Task;
	} catch {
		return null;
	}
}

export async function updateTaskViaApi(
	taskId: number,
	fields: { title?: string; description?: string; status?: string },
): Promise<Task | null> {
	try {
		const res = await fetch(`${API_URL}/tasks/${taskId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(fields),
		});
		if (!res.ok) return null;
		return (await res.json()) as Task;
	} catch {
		return null;
	}
}
