import { z } from "zod";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE } from "@crow-central-agency/shared";
import type { NotesManager } from "../../services/notes/notes-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import {
  applyLineEdit,
  buildLineEditNote,
  formatVersionToken,
  getErrorToolResult,
  LINE_EDIT_MODE,
  LINE_EDIT_MODE_VALUES,
  textToolResult,
} from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";

export const EDIT_NOTE_TOOL_NAME = "edit_note";

export function getEditNoteToolConfig(notesManager: NotesManager, sensorManager: SensorManager) {
  const inputSchema = {
    id: z.string().describe("The id of an existing text note, as returned by list_notes or search_workspace."),
    mode: z
      .enum(LINE_EDIT_MODE_VALUES)
      .describe(
        "Edit mode. 'insert': insert new lines before startLine. 'replace': replace lines startLine..endLine inclusive."
      ),
    content: z.string().describe("The new text to insert or use as replacement."),
    startLine: z
      .number()
      .min(1)
      .describe(
        "1-based line number. For 'insert', new lines are placed before this line. For 'replace', this is the first line replaced."
      ),
    endLine: z
      .number()
      .min(1)
      .optional()
      .describe("1-based inclusive last line to replace. Required for 'replace' mode. Ignored for 'insert'."),
    version: z
      .number()
      .describe("The Version value from your most recent read or edit of this note (the [Version: ...] token)."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ id, mode, content, startLine, endLine, version }) => {
    try {
      if (mode === LINE_EDIT_MODE.REPLACE && endLine === undefined) {
        throw new Error("endLine is required for 'replace' mode.");
      }

      const note = notesManager.getNote(id);
      if (note.isTrashed) {
        return textToolResult([`Note not found: ${id}`], true);
      }

      if (note.entityType === ENTITY_TYPE.NOTE_FOLDER) {
        return textToolResult([`${id} is a folder; only text notes can be edited.`], true);
      }

      const { content: existingContent, metadata } = await notesManager.getNoteContent(id);
      if (metadata.contentType !== NOTE_CONTENT_TYPE.TEXT || typeof existingContent !== "string") {
        return textToolResult(
          [`edit_note only supports text notes (${metadata.name} is ${metadata.contentType}).`],
          true
        );
      }

      const { content: nextContent, insertedLineCount } = applyLineEdit(
        existingContent,
        content,
        mode,
        startLine,
        endLine
      );
      const updated = await notesManager.writeNoteContent(id, nextContent, version);
      const userTimezone = await sensorManager.getUserTimezone();
      const editNote = buildLineEditNote(mode, startLine, endLine, insertedLineCount);

      return textToolResult([
        `Note edited: ${updated.name} (id: ${updated.id}, size: ${updated.size} bytes, modified: ${formatLocalDateTime(new Date(updated.updatedTimestamp), userTimezone)}) [${formatVersionToken(updated.updatedTimestamp)}] — ${editNote}`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to edit note.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: EDIT_NOTE_TOOL_NAME,
    description:
      "Change an existing text note in the user's notes by inserting or replacing a range of lines. Requires the Version from your most recent read_note or edit_note of it.",
    inputSchema,
    handler,
  };

  return config;
}
