import { z } from "zod";
import { AGENT_TASK_SOURCE_TYPE, ENTITY_TYPE } from "@crow-central-agency/shared";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { ArtifactLocation } from "../../services/artifact/artifact-manager.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const MOVE_ARTIFACT_TOOL_NAME = "move_artifact";

export function getMoveArtifactToolConfig(agentId: string, artifactManager: ArtifactManager) {
  const inputSchema = {
    filename: z
      .string()
      .describe("Exact source filename to move, as returned by list_artifacts or list_circle_artifacts."),
    source_circle_id: z
      .string()
      .optional()
      .describe("Circle the artifact currently lives in. Omit to move from your own artifacts folder."),
    destination_circle_id: z
      .string()
      .optional()
      .describe("Circle to move the artifact into. Omit to move into your own artifacts folder."),
    destination_filename: z
      .string()
      .optional()
      .describe(
        "Filename at the destination. Defaults to the source filename. Required, and must differ from the source, to rename in place when the source and destination location are the same."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({
    filename,
    source_circle_id,
    destination_circle_id,
    destination_filename,
  }) => {
    const source: ArtifactLocation = source_circle_id
      ? { entityType: ENTITY_TYPE.AGENT_CIRCLE, entityId: source_circle_id }
      : { entityType: ENTITY_TYPE.AGENT, entityId: agentId };
    const destination: ArtifactLocation = destination_circle_id
      ? { entityType: ENTITY_TYPE.AGENT_CIRCLE, entityId: destination_circle_id }
      : { entityType: ENTITY_TYPE.AGENT, entityId: agentId };

    const sameLocation = source.entityType === destination.entityType && source.entityId === destination.entityId;
    if (sameLocation && !destination_filename) {
      return textToolResult(
        [
          "Error: source and destination are the same location. Provide destination_filename to rename in place, or a different circle to move.",
        ],
        true
      );
    }

    if (source_circle_id && !artifactManager.isDirectCircleMember(source_circle_id, agentId)) {
      return textToolResult(["You are not a direct member of the source circle."], true);
    }

    if (destination_circle_id && !artifactManager.isDirectCircleMember(destination_circle_id, agentId)) {
      return textToolResult(["You are not a direct member of the destination circle."], true);
    }

    try {
      // Source-removal author guard — mirror the delete tools so move can't bypass them.
      const sourceMetadata = source_circle_id
        ? await artifactManager.getCircleArtifactMetadata(source_circle_id, filename)
        : await artifactManager.getArtifactMetadata(agentId, filename);
      const { createdBy } = sourceMetadata;
      const canRemoveSource = source_circle_id
        ? createdBy.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT
        : createdBy.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT && createdBy.agentId === agentId;
      if (!canRemoveSource) {
        const action = sameLocation ? "rename" : "move";
        return textToolResult(
          [`Error: cannot ${action} ${filename} - it is not yours (created by: ${createdBy.sourceType}).`],
          true
        );
      }

      const metadata = await artifactManager.moveArtifact(source, destination, filename, {
        destinationFilename: destination_filename,
        movedBy: { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId },
      });

      const sourceLabel = source_circle_id ? `circle ${source_circle_id}` : "your artifacts";
      const destinationLabel = destination_circle_id ? `circle ${destination_circle_id}` : "your artifacts";
      const requestedFilename = destination_filename ?? sourceMetadata.filename;
      const normalizedNote =
        metadata.filename !== requestedFilename
          ? ` (normalized from "${requestedFilename}" - use this exact filename on subsequent reads)`
          : "";

      const summary = sameLocation
        ? `Renamed ${filename} to ${metadata.filename} in ${destinationLabel}${normalizedNote}`
        : `Moved ${filename} from ${sourceLabel} to ${destinationLabel} as ${metadata.filename}${normalizedNote}`;

      return textToolResult([summary]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to move artifact.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: MOVE_ARTIFACT_TOOL_NAME,
    description:
      "Move or rename one of your artifacts. Move it between your own folder and a circle you are a direct member of (own↔circle, or circle↔circle), or rename it in place by keeping the same location and passing a new destination_filename. Omit source_circle_id/destination_circle_id to use your own folder. You can only move or rename artifacts you authored from your own folder, or agent-authored artifacts from a circle. Fails if an artifact with the destination name already exists; use a different destination_filename or delete the existing one first.",
    inputSchema,
    handler,
  };

  return config;
}
