import { z } from "zod";
import type { NotesManager } from "../../services/notes/notes-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { compareNoteEntries, formatNoteEntry } from "./user-notes-format-utils.js";

const DEFAULT_NOTES_LIMIT = 50;

export const LIST_NOTES_TOOL_NAME = "list_notes";

export function getListNotesToolConfig(notesManager: NotesManager, sensorManager: SensorManager) {
  const inputSchema = {
    folderId: z
      .string()
      .optional()
      .describe("The id of the folder to list, as returned by list_notes or search_workspace. Omit to list the root."),
    limit: z.number().optional().describe(`Number of entries to return per page (default: ${DEFAULT_NOTES_LIMIT}).`),
    offset: z.number().optional().describe("Number of entries to skip before the page starts (0-based offset)."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ folderId, limit, offset }) => {
    try {
      const entries = notesManager.listNotes({ parentId: folderId }).sort(compareNoteEntries);
      const folderLabel = folderId ? `folder ${folderId}` : "the notes root";
      if (entries.length === 0) {
        return textToolResult([`No notes or folders in ${folderLabel}.`]);
      }

      const userTimezone = await sensorManager.getUserTimezone();
      const pagination = applyPagination(entries, limit || DEFAULT_NOTES_LIMIT, offset);
      const lines = pagination.items.map((entry) => formatNoteEntry(entry, userTimezone));
      const header = formatPaginationHeader(`Notes in ${folderLabel}`, pagination);
      return textToolResult(header.concat("", lines));
    } catch (error) {
      return getErrorToolResult(error, "Failed to list notes.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_NOTES_TOOL_NAME,
    description: `List the notes and folders directly inside one folder of the user's notes, folders first, then by name (default: ${DEFAULT_NOTES_LIMIT} items). Returns each entry's id, type, name, last updated time, and size for notes. Read a note with read_note; list a folder by passing its id as folderId.`,
    inputSchema,
    annotations: { readOnlyHint: true },
    handler,
  };

  return config;
}
