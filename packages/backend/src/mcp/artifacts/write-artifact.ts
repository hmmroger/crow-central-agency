import { z } from "zod";
import { AGENT_TASK_SOURCE_TYPE, ARTIFACT_CONTENT_TYPE } from "@crow-central-agency/shared";
import type { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { ARTIFACT_CONTENT_TYPE_VALUES, ARTIFACT_TYPE_VALUES } from "./artifacts-mcp-server-utils.js";

export const WRITE_ARTIFACT_TOOL_NAME = "write_artifact";

export function getWriteArtifactToolConfig(
  agentId: string,
  artifactManager: ArtifactManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    filename: z.string().describe("Name of the file to create or overwrite, e.g. 'report.md' or 'data.json'"),
    content: z
      .string()
      .describe(
        "The content to write. For TEXT content type, provide the raw text. For binary content types (IMAGE, AUDIO, BINARY), provide base64-encoded data."
      ),
    type: z
      .enum(ARTIFACT_TYPE_VALUES)
      .optional()
      .describe(
        `Artifact memory layer. STRONG: critical long-term info. STANDARD: general-purpose (default). NEAR: tied to recent/ongoing work. LOOSE: may be compressed or summarized, not guaranteed to be fully faithful. TEMPORARY: short-lived, expected to expire soon — use for any transient or disposable output.`
      ),
    content_type: z
      .enum(ARTIFACT_CONTENT_TYPE_VALUES)
      .optional()
      .describe(
        `Content type annotation. Values: ${ARTIFACT_CONTENT_TYPE_VALUES.join(", ")}. Defaults to ${ARTIFACT_CONTENT_TYPE.TEXT}`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ filename, content, type, content_type }) => {
    try {
      const isBinary = content_type && content_type !== ARTIFACT_CONTENT_TYPE.TEXT;
      const artifactContent: string | Buffer = isBinary ? Buffer.from(content, "base64") : content;
      const metadata = await artifactManager.writeArtifact(agentId, filename, artifactContent, {
        type,
        contentType: content_type,
        createdBy: { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId },
      });
      const userTimezone = await sensorManager.getUserTimezone();

      return textToolResult([
        `Artifact written: ${filename} (type: ${metadata.type}, modified: ${formatLocalDateTime(new Date(metadata.updatedTimestamp), userTimezone)})`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to write artifact.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: WRITE_ARTIFACT_TOOL_NAME,
    description:
      "Save a file to your own artifacts folder. Other agents can read your artifacts to collaborate. You can only write to your own folder.",
    inputSchema,
    handler,
  };

  return config;
}
