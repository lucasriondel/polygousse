import { wsRequest } from "@/lib/ws-client";
import type { TaskAttachment } from "../types";

export interface AttachmentSlice {
	attachments: Map<number, TaskAttachment>;
	uploadAttachment: (taskId: number, file: File) => Promise<TaskAttachment>;
	deleteAttachment: (id: number) => Promise<void>;
}

export const createAttachmentSlice = (): AttachmentSlice => ({
	attachments: new Map(),

	uploadAttachment: async (taskId, file) => {
		const base64 = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
			};
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
		return wsRequest("attachment:upload", {
			taskId,
			filename: file.name,
			mime_type: file.type || "application/octet-stream",
			data: base64,
		});
	},

	deleteAttachment: async (id) => {
		await wsRequest("attachment:delete", { id });
	},
});
