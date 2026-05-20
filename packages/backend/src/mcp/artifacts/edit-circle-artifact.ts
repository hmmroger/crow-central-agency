import { z } from "zod";
import { ARTIFACT_CONTENT_TYPE } from "@crow-central-agency/shared";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { applyLineEdit, EDIT_ARTIFACT_MODE, EDIT_ARTIFACT_MODE_VALUES } from "./artifacts-mcp-server-utils.js";

export const EDIT_CIRCLE_ARTIFACT_TOOL_NAME = "edit_circle_artifact";

export function getEditCircleArtifactToolConfig(
  agentId: string,
  artifactManager: ArtifactManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    circle_id: z.string().describe("The circle ID that owns the artifact."),
    filename: z.string().describe("Name of an existing TEXT circle artifact to edit."),
    mode: z
      .enum(EDIT_ARTIFACT_MODE_VALUES)
      .describe(
        "Edit mode. 'insert': insert new lines before startLine. 'replace': replace lines startLine..endLine inclusive. Both require a TEXT artifact."
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
      .describe("The Version value from your most recent read of this artifact (the [Version: ...] token)."),
    addTags: z.array(z.string()).optional().describe("Optional tags to add to the artifact."),
    removeTags: z.array(z.string()).optional().describe("Optional tags to remove from the artifact."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({
    circle_id,
    filename: rawFilename,
    content,
    mode,
    startLine,
    endLine,
    version,
    addTags,
    removeTags,
  }) => {
    if (!artifactManager.isDirectCircleMember(circle_id, agentId)) {
      return textToolResult(["You are not a direct member of this circle."], true);
    }

    const filename = rawFilename.trim();
    try {
      if (mode === EDIT_ARTIFACT_MODE.REPLACE && endLine === undefined) {
        throw new Error("endLine is required for 'replace' mode.");
      }

      const { content: existingContent, metadata } = await artifactManager.readCircleArtifact(circle_id, filename);
      if (metadata.contentType !== ARTIFACT_CONTENT_TYPE.TEXT || typeof existingContent !== "string") {
        throw new Error(
          `edit_circle_artifact only supports TEXT artifacts (${metadata.filename} is ${metadata.contentType}). Use write_circle_artifact to replace the file.`
        );
      }

      const nextContent = applyLineEdit(existingContent, content, mode, startLine, endLine);
      const updated = await artifactManager.updateCircleArtifact(circle_id, filename, {
        content: nextContent,
        addTags,
        removeTags,
        expectedUpdatedTimestamp: version,
      });
      const userTimezone = await sensorManager.getUserTimezone();
      const editNote =
        mode === EDIT_ARTIFACT_MODE.REPLACE
          ? `replaced lines ${startLine}-${endLine}`
          : `inserted at line ${startLine}`;

      return textToolResult([
        `Circle artifact edited: ${updated.filename} (circle: ${circle_id}, ${editNote}, size: ${updated.size} bytes, modified: ${formatLocalDateTime(new Date(updated.updatedTimestamp), userTimezone)}). Re-read the artifact before the next edit; line numbers and Version are now stale.`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to edit circle artifact.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: EDIT_CIRCLE_ARTIFACT_TOOL_NAME,
    description:
      "Surgically modify a TEXT circle artifact by inserting or replacing a range of lines. Only direct members of the circle can edit. Use write_circle_artifact to replace the full file or to write non-TEXT content.",
    inputSchema,
    handler,
  };

  return config;
}
