import { useQuery } from "@tanstack/react-query";
import { ENTITY_TYPE, type EntityType } from "@crow-central-agency/shared";
import { fetchRaw } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

interface TextArtifactContent {
  type: "text";
  filename: string;
  content: string;
}

interface BinaryArtifactContent {
  type: "binary";
  filename: string;
  blobUrl: string;
  mimeType: string;
}

export type ArtifactContent = TextArtifactContent | BinaryArtifactContent;

function getArtifactPath(entityType: EntityType, entityId: string, filename: string): string {
  const prefix = entityType === ENTITY_TYPE.AGENT ? "agents" : "circles";
  return `/${prefix}/${entityId}/artifacts/${encodeURIComponent(filename)}`;
}

/**
 * Fetch artifact file content via React Query.
 * Returns text content for text artifacts, or a blob URL for binary artifacts.
 */
export function useArtifactContentQuery(entityType: EntityType, entityId: string, filename: string) {
  return useQuery<ArtifactContent, ApiError>({
    queryKey: agentKeys.artifactContent(entityType, entityId, filename),
    gcTime: 0, // blob URLs are ephemeral — don't cache after unmount
    queryFn: async () => {
      const response = await fetchRaw(getArtifactPath(entityType, entityId, filename));
      if (!response.ok) {
        throw new Error(`Failed to fetch artifact: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = (await response.json()) as { success: boolean; data: { filename: string; content: string } };
        return { type: "text", filename: json.data.filename, content: json.data.content };
      }

      const blob = await response.blob();
      return { type: "binary", filename, blobUrl: URL.createObjectURL(blob), mimeType: contentType };
    },
  });
}
