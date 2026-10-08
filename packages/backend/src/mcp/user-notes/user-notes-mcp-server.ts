import type { NotesManager } from "../../services/notes/notes-manager.js";
import type { TagManager } from "../../services/tag/tag-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getListNotesToolConfig } from "./list-notes.js";
import { getReadNoteToolConfig } from "./read-note.js";

export const USER_NOTES_MCP_SERVER_NAME = "crow-user-notes";

/** Define the crow-user-notes MCP server: read-only access to the user's live notes, opt-in per agent. */
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
    ],
  };
}
