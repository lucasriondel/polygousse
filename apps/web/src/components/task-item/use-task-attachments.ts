import { useCallback, useMemo } from "react";
import { shallowArrayEqual } from "@/lib/shallow-array-equal";
import { useStore } from "@/store";
import type { TaskAttachment } from "@/store/types";

export function useTaskAttachments(taskId: number) {
	const selector = useMemo(
		() => (s: { attachments: Map<number, TaskAttachment> }) => {
			const result: TaskAttachment[] = [];
			for (const a of s.attachments.values()) {
				if (a.task_id === taskId) result.push(a);
			}
			return result.sort((a, b) => a.created_at.localeCompare(b.created_at));
		},
		[taskId],
	);
	const taskAttachments = useStore(selector, shallowArrayEqual);
	const uploadAttachment = useStore((s) => s.uploadAttachment);
	const deleteAttachment = useStore((s) => s.deleteAttachment);

	const handleFiles = useCallback(
		(files: FileList | File[]) => {
			for (const file of Array.from(files)) {
				let uploadFile = file;
				// Rename generic clipboard paste names
				if (file.name === "image.png" || file.name === "image.jpg" || file.name === "image.jpeg") {
					const ext = file.name.split(".").pop();
					const newName = `paste-${Date.now()}.${ext}`;
					uploadFile = new File([file], newName, { type: file.type });
				}
				uploadAttachment(taskId, uploadFile);
			}
		},
		[taskId, uploadAttachment],
	);

	return { taskAttachments, handleFiles, deleteAttachment };
}
