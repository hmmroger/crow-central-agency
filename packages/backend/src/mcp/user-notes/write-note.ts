import { z } from "zod";
import type { NotesManager } from "../../services/notes/notes-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { formatVersionToken, getErrorToolResult, textToolResult } from "../tool-utils.js";

export const WRITE_NOTE_TOOL_NAME = "write_note";

export function getWriteNoteToolConfig(notesManager: NotesManager) {
  const inputSchema = {
    name: z.string().describe("Name of the new note or folder."),
    content: z.string().optional().describe("Text content of the new note. Required for a note; omit for a folder."),
    folderId: z
      .string()
      .optional()
      .describe("The id of the folder to create in, as returned by list_notes or search_workspace. Omit for the root."),
    isFolder: z.boolean().optional().describe("Optional. Create a folder instead of a note (default: false)."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ name, content, folderId, isFolder }) => {
    try {
      if (isFolder) {
        if (content !== undefined) {
          throw new Error("A folder takes no content; omit content when isFolder is set.");
        }

        const folder = await notesManager.createFolder(name, { parentId: folderId });
        return textToolResult([`Folder created: ${folder.name} (id: ${folder.id})`]);
      }

      if (!content?.trim()) {
        throw new Error("Note content must not be empty.");
      }

      const note = await notesManager.createNote(name, content, { parentId: folderId });
      return textToolResult([
        `Note created: ${note.name} (id: ${note.id}) [${formatVersionToken(note.updatedTimestamp)}]`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to write note.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: WRITE_NOTE_TOOL_NAME,
    description:
      "Create a new text note, or a folder with isFolder, in the user's notes. Never replaces an existing entry; a taken name is an error. Use edit_note to change an existing note.",
    inputSchema,
    handler,
  };

  return config;
}
