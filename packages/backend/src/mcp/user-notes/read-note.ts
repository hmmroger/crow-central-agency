import { z } from "zod";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE } from "@crow-central-agency/shared";
import type { NotesManager } from "../../services/notes/notes-manager.js";
import type { TagManager } from "../../services/tag/tag-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { buildFileContentResult, DEFAULT_READ_LINE_LIMIT, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";

export const READ_NOTE_TOOL_NAME = "read_note";

export function getReadNoteToolConfig(
  notesManager: NotesManager,
  tagManager: TagManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    id: z.string().describe("The note id, as returned by list_notes or search_workspace."),
    showLineNumber: z.boolean().optional().describe("Optional. Add line marker in the result."),
    startLine: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. Starting line number (1-based) to begin reading from (default: 1)."),
    limit: z
      .number()
      .min(1)
      .optional()
      .describe(
        `Optional. Maximum number of lines to return starting from startLine (default: ${DEFAULT_READ_LINE_LIMIT}).`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ id, showLineNumber, startLine, limit }) => {
    try {
      const note = notesManager.getNote(id);
      if (note.isTrashed) {
        return textToolResult([`Note not found: ${id}`], true);
      }

      if (note.entityType === ENTITY_TYPE.NOTE_FOLDER) {
        return textToolResult([`${id} is a folder; list its entries with list_notes.`], true);
      }

      const [{ content, metadata }, userTimezone] = await Promise.all([
        notesManager.getNoteContent(id),
        sensorManager.getUserTimezone(),
      ]);
      const header = [
        `--- METADATA ---`,
        `[Id: ${metadata.id} | Name: ${metadata.name} | Content: ${metadata.contentType} | Modified: ${formatLocalDateTime(new Date(metadata.updatedTimestamp), userTimezone)} | Size: ${metadata.size} bytes]`,
      ];
      const tagNames = tagManager.getEntityTags(metadata.entityType, metadata.id).map((tag) => tag.name);
      if (tagNames.length) {
        header.push(`[Tags: ${tagNames.join(", ")}]`);
      }

      return buildFileContentResult(
        header,
        content,
        {
          filename: metadata.path,
          isText: metadata.contentType === NOTE_CONTENT_TYPE.TEXT,
          resourceUri: `note://${metadata.id}`,
          unsupportedNotice: `[Binary note: ${metadata.contentType} content (${metadata.size} bytes). This binary format is not supported for interpretation.]`,
        },
        { showLineNumber, startLine, limit: limit ?? DEFAULT_READ_LINE_LIMIT }
      );
    } catch (error) {
      return getErrorToolResult(error, "Failed to read note.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: READ_NOTE_TOOL_NAME,
    description:
      "Read one of the user's notes by id. Text notes are returned in line windows, images as image content, PDFs as an embedded resource, and other files as metadata only. Use list_notes or search_workspace to find note ids; a folder id is an error.",
    inputSchema,
    annotations: { readOnlyHint: true },
    handler,
  };

  return config;
}
