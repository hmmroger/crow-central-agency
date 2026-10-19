import type { NotesManager } from "../../services/notes/notes-manager.js";
import type { TagManager } from "../../services/tag/tag-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { defineMcpTool, toInternalMcpToolName } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getListNotesToolConfig, LIST_NOTES_TOOL_NAME } from "./list-notes.js";
import { getReadNoteToolConfig, READ_NOTE_TOOL_NAME } from "./read-note.js";
import { getWriteNoteToolConfig, WRITE_NOTE_TOOL_NAME } from "./write-note.js";
import { EDIT_NOTE_TOOL_NAME, getEditNoteToolConfig } from "./edit-note.js";

export const USER_NOTES_MCP_SERVER_NAME = "crow-user-notes";

/** The input field holding the note id each tool's permission rules are scoped by, keyed by full tool name */
export const USER_NOTES_PERMISSION_SCOPE_FIELDS: ReadonlyMap<string, string> = new Map([
  [toInternalMcpToolName(USER_NOTES_MCP_SERVER_NAME, LIST_NOTES_TOOL_NAME), "folderId"],
  [toInternalMcpToolName(USER_NOTES_MCP_SERVER_NAME, READ_NOTE_TOOL_NAME), "id"],
  [toInternalMcpToolName(USER_NOTES_MCP_SERVER_NAME, WRITE_NOTE_TOOL_NAME), "folderId"],
  [toInternalMcpToolName(USER_NOTES_MCP_SERVER_NAME, EDIT_NOTE_TOOL_NAME), "id"],
]);

/** Define the crow-user-notes MCP server: read, create and line-edit the user's live notes, opt-in per agent. */
export function getUserNotesMcpServerDefinition(
  notesManager: NotesManager,
  tagManager: TagManager,
  sensorManager: SensorManager
): McpServerDefinition {
  return {
    name: USER_NOTES_MCP_SERVER_NAME,
    isConfigurable: true,
    displayName: "User Notes",
    getTools: () => [
      defineMcpTool(getListNotesToolConfig(notesManager, sensorManager)),
      defineMcpTool(getReadNoteToolConfig(notesManager, tagManager, sensorManager)),
      defineMcpTool(getWriteNoteToolConfig(notesManager)),
      defineMcpTool(getEditNoteToolConfig(notesManager, sensorManager)),
    ],
  };
}
