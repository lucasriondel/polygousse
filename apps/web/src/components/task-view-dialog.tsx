import { Play, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttachmentThumb } from "@/components/task-item/attachment-thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import type { Task } from "@/hooks/use-tasks";
import { API_BASE_URL } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { LinearTaskLink, TaskAttachment } from "@/store/types";

interface TaskViewDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	task: Task;
	onUpdate: (id: number, fields: Partial<Pick<Task, "title" | "description" | "status">>) => void | Promise<unknown>;
	taskAttachments: TaskAttachment[];
	handleFiles: (files: FileList | File[]) => void;
	deleteAttachment: (id: number) => void;
	linearLink?: LinearTaskLink;
	onStart?: (id: number) => void;
}

export function TaskViewDialog({
	open,
	onOpenChange,
	task,
	onUpdate,
	taskAttachments,
	handleFiles,
	deleteAttachment,
	linearLink,
	onStart,
}: TaskViewDialogProps) {
	const [titleValue, setTitleValue] = useState(task.title);
	const [descValue, setDescValue] = useState(task.description ?? "");
	const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
	const titleRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);

	// Sync from server when dialog opens or task changes externally
	useEffect(() => {
		if (open) {
			setTitleValue(task.title);
			setDescValue(task.description ?? "");
		}
	}, [open, task.title, task.description]);

	// Auto-focus title on open
	useEffect(() => {
		if (open) {
			requestAnimationFrame(() => titleRef.current?.focus());
		}
	}, [open]);

	const autoResize = (el: HTMLTextAreaElement | null) => {
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	};

	const flushChanges = useCallback(async () => {
		const trimmedTitle = titleValue.trim();
		const trimmedDesc = descValue.trim() || null;
		const fields: Partial<Pick<Task, "title" | "description">> = {};
		if (trimmedTitle !== task.title && trimmedTitle !== "") {
			fields.title = trimmedTitle;
		}
		if (trimmedDesc !== task.description) {
			fields.description = trimmedDesc ?? "";
		}
		if (Object.keys(fields).length > 0) {
			await onUpdate(task.id, fields);
		}
	}, [titleValue, descValue, task.title, task.description, task.id, onUpdate]);

	const handleClose = async (nextOpen: boolean) => {
		if (!nextOpen) {
			await flushChanges();
		}
		onOpenChange(nextOpen);
	};

	const isDone = task.status === "done";
	const canStart =
		onStart &&
		(task.status === "todo" || task.status === "waiting_for_input") &&
		task.title.trim() !== "";

	return (
		<>
			<Dialog open={open} onOpenChange={handleClose}>
				<DialogContent className="sm:max-w-2xl" showCloseButton={false}>
					{/* Title */}
					<input
						ref={titleRef}
						className={cn(
							"w-full bg-transparent outline-none text-lg font-semibold",
							isDone && "opacity-60 line-through",
						)}
						value={titleValue}
						onChange={(e) => setTitleValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								descRef.current?.focus();
							}
						}}
						placeholder="Task title…"
					/>

					{/* Linear badge */}
					{linearLink && (
						<div className="flex items-center gap-2">
							<span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-500">
								{linearLink.linear_issue_identifier}
							</span>
						</div>
					)}

					{/* Description */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone for file uploads */}
					<div
						className="min-h-[80px] max-h-[40vh] overflow-y-auto"
						onDragOver={(e) => {
							e.preventDefault();
							e.dataTransfer.dropEffect = "copy";
						}}
						onDrop={(e) => {
							if (e.dataTransfer.files.length > 0) {
								e.preventDefault();
								e.stopPropagation();
								handleFiles(e.dataTransfer.files);
							}
						}}
					>
						<textarea
							ref={(el) => {
								descRef.current = el;
								autoResize(el);
							}}
							className="w-full bg-transparent outline-none text-sm text-muted-foreground resize-none"
							value={descValue}
							rows={3}
							onChange={(e) => {
								setDescValue(e.target.value);
								autoResize(e.target);
							}}
							onPaste={(e) => {
								if (e.clipboardData.files.length > 0) {
									e.preventDefault();
									handleFiles(e.clipboardData.files);
								}
							}}
							placeholder="Add details…"
						/>
					</div>

					{/* Attachments */}
					{taskAttachments.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{taskAttachments.map((att) => {
								const isImage = att.mime_type.startsWith("image/");
								const src = `${API_BASE_URL}/attachments/${att.id}/file`;
								return (
									<div key={att.id} className="relative group/att">
										{isImage ? (
											<button
												type="button"
												onClick={() => setPreviewImage({ src, alt: att.filename })}
												className="h-16 w-16 rounded border border-border overflow-hidden hover:ring-2 hover:ring-ring transition-shadow cursor-pointer"
											>
												<img src={src} alt={att.filename} className="h-full w-full object-cover" />
											</button>
										) : (
											<AttachmentThumb attachment={att} onDelete={deleteAttachment} />
										)}
										{isImage && (
											<button
												type="button"
												className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
												onClick={(e) => {
													e.stopPropagation();
													deleteAttachment(att.id);
												}}
											>
												<X className="h-2.5 w-2.5" />
											</button>
										)}
									</div>
								);
							})}
						</div>
					)}

					{/* Footer */}
					<DialogFooter>
						{canStart && (
							<Button
								variant="default"
								className="gap-1.5"
								onClick={async () => {
									await flushChanges();
									onStart(task.id);
									onOpenChange(false);
								}}
							>
								<Play className="h-4 w-4" />
								Start task
							</Button>
						)}
						<Button variant="outline" onClick={() => handleClose(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Image preview overlay */}
			<DialogPrimitive.Root open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
				<DialogPrimitive.Portal>
					<DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
					<DialogPrimitive.Content
						className="fixed inset-0 z-[100] flex items-center justify-center p-8 outline-none"
						onClick={() => setPreviewImage(null)}
					>
						<DialogPrimitive.Title className="sr-only">
							{previewImage?.alt ?? "Image preview"}
						</DialogPrimitive.Title>
						<button
							type="button"
							onClick={() => setPreviewImage(null)}
							className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors cursor-pointer"
						>
							<X className="h-5 w-5" />
						</button>
						{previewImage && (
							// biome-ignore lint/a11y/useKeyWithClickEvents: image preview click-to-dismiss
							<img
								src={previewImage.src}
								alt={previewImage.alt}
								className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
								onClick={(e) => e.stopPropagation()}
							/>
						)}
					</DialogPrimitive.Content>
				</DialogPrimitive.Portal>
			</DialogPrimitive.Root>
		</>
	);
}
