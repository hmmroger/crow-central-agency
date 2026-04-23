import path from "node:path";
import { ARTIFACT_CONTENT_TYPE, ARTIFACT_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { processTextContent, textToolResult, type ReadLineOptions } from "../tool-utils.js";

export const ARTIFACT_TYPE_VALUES = Object.values(ARTIFACT_TYPE);
export const ARTIFACT_CONTENT_TYPE_VALUES = Object.values(ARTIFACT_CONTENT_TYPE);

/** Image extensions that Claude can process natively via base64 */
const SUPPORTED_IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** PDF extension for document support */
const PDF_MIME = "application/pdf";

/** Build the MCP content blocks for a read artifact result */
export function buildReadArtifactResult(
  content: string | Buffer,
  metadata: ArtifactMetadata,
  userTimezone: string,
  lineOptions?: ReadLineOptions
) {
  const header = [
    `--- METADATA ---`,
    `[Type: ${metadata.type} | Content: ${metadata.contentType} | Modified: ${formatLocalDateTime(new Date(metadata.updatedTimestamp), userTimezone)}]`,
  ];

  if (typeof content === "string" || metadata.contentType === ARTIFACT_CONTENT_TYPE.TEXT) {
    const rawText = typeof content === "string" ? content : content.toString("utf-8");
    const processed = processTextContent(rawText, lineOptions);
    return textToolResult(header.concat(processed.headerParts).concat(["", processed.text]));
  }

  const ext = path.extname(metadata.filename).toLowerCase();
  const imageMime = SUPPORTED_IMAGE_MIME[ext];

  if (imageMime) {
    return {
      content: [
        { type: "text" as const, text: header.join("\n") },
        { type: "image" as const, data: content.toString("base64"), mimeType: imageMime },
      ],
    };
  }

  if (ext === ".pdf") {
    return {
      content: [
        { type: "text" as const, text: header.join("\n") },
        {
          type: "resource" as const,
          resource: {
            uri: `artifact://${metadata.entityId}/${metadata.filename}`,
            mimeType: PDF_MIME,
            blob: content.toString("base64"),
          },
        },
      ],
    };
  }

  return textToolResult([
    ...header,
    `[Binary artifact: ${metadata.contentType} content (${metadata.size} bytes). This binary format is not supported for interpretation.]`,
  ]);
}
