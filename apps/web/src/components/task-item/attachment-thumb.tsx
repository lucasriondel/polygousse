import { FileText, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import type { TaskAttachment } from "@/store/types";

export function AttachmentThumb({
	attachment,
	onDelete,
}: {
	attachment: TaskAttachment;
	onDelete: (id: number) => void;
}) {
	const isImage = attachment.mime_type.startsWith("image/");

	return (
		<div className="group/att relative">
			{isImage ? (
				<img
					src={`${API_BASE_URL}/attachments/${attachment.id}/file`}
					alt={attachment.filename}
					className="h-16 w-16 object-cover rounded border border-border"
				/>
			) : (
				<div className="h-16 w-16 flex flex-col items-center justify-center rounded border border-border bg-muted/50 p-1">
					<FileText className="h-5 w-5 text-muted-foreground" />
					<span className="text-[9px] text-muted-foreground truncate w-full text-center mt-0.5">
						{attachment.filename}
					</span>
				</div>
			)}
			<button
				type="button"
				className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
				onMouseDown={(e) => e.preventDefault()}
				onClick={(e) => {
					e.stopPropagation();
					onDelete(attachment.id);
				}}
			>
				<X className="h-2.5 w-2.5" />
			</button>
		</div>
	);
}
