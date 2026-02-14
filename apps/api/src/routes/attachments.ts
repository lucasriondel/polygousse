import { readFile } from "node:fs/promises";
import { getAttachmentById } from "@polygousse/database";
import type { FastifyPluginAsync } from "fastify";
import { IdParams } from "./schemas.js";

// MIME types safe to serve inline (rendered by the browser).
// Everything else is forced to Content-Disposition: attachment to prevent stored XSS.
const SAFE_INLINE_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/bmp",
	"image/x-icon",
	"application/pdf",
	"text/plain",
	"audio/mpeg",
	"audio/ogg",
	"audio/wav",
	"video/mp4",
	"video/webm",
]);

const attachmentRoutes: FastifyPluginAsync = async (fastify) => {
	// GET /attachments/:id/file — Serve file binary with correct Content-Type
	fastify.get<{ Params: IdParams }>(
		"/attachments/:id/file",
		{ schema: { params: IdParams } },
		async (request, reply) => {
			const { id } = request.params;
			const attachment = getAttachmentById.get(Number(id));
			if (!attachment) {
				return reply.status(404).send({ error: "Attachment not found" });
			}

			const fileBuffer = await readFile(attachment.stored_path);

			// Sanitize filename for Content-Disposition to prevent header injection
			const safeFilename = attachment.filename
				.replace(/[\r\n]/g, "") // strip newlines (header injection)
				.replace(/["\\/]/g, "_"); // replace quotes and backslashes
			const encodedFilename = encodeURIComponent(attachment.filename);

			// Only serve safe MIME types inline; force download for everything else
			// to prevent stored XSS (e.g. text/html with embedded JavaScript)
			const isInlineSafe = SAFE_INLINE_MIME_TYPES.has(attachment.mime_type);
			const disposition = isInlineSafe ? "inline" : "attachment";
			const contentType = isInlineSafe ? attachment.mime_type : "application/octet-stream";

			return reply
				.type(contentType)
				.header(
					"Content-Disposition",
					`${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
				)
				.send(fileBuffer);
		},
	);
};

export default attachmentRoutes;
