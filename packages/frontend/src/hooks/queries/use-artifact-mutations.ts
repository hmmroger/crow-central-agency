import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import {
  updateAgentArtifactContent,
  updateAgentArtifactTags,
  updateCircleArtifactContent,
  updateCircleArtifactTags,
  unwrapResponse,
} from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

interface UpdateArtifactTagsVars {
  artifact: ArtifactMetadata;
  addTags?: string[];
  removeTags?: string[];
}

interface UpdateArtifactContentVars {
  artifact: ArtifactMetadata;
  content: string;
}

/** Match any artifact list query (agent-owned or circle) regardless of which agent it is keyed under */
function isArtifactListQuery(queryKey: QueryKey): boolean {
  if (queryKey[0] !== agentKeys.all[0]) {
    return false;
  }

  const lastSegment = queryKey[queryKey.length - 1];
  return lastSegment === "artifacts" || lastSegment === "circle-artifacts";
}

/**
 * Apply an add/remove tag delta to an owned artifact, dispatching to the agent or circle
 * endpoint by the artifact's entity type. Consumers refresh via their existing refetch
 * callback on success — this hook does not invalidate query keys itself.
 */
export function useUpdateArtifactTags() {
  return useMutation<ArtifactMetadata, ApiError, UpdateArtifactTagsVars>({
    mutationFn: async ({ artifact, addTags, removeTags }) => {
      const update = { addTags, removeTags };
      const response =
        artifact.entityType === ENTITY_TYPE.AGENT_CIRCLE
          ? await updateCircleArtifactTags(artifact.entityId, artifact.filename, update)
          : await updateAgentArtifactTags(artifact.entityId, artifact.filename, update);

      return unwrapResponse(response);
    },
  });
}

/**
 * Replace the raw text content of an owned artifact, dispatching to the agent or circle endpoint by
 * entity type and guarding the write with the artifact's current updatedTimestamp. On success the
 * cached content and artifact lists are invalidated so the refreshed size/updatedTimestamp surface.
 */
export function useUpdateArtifactContent() {
  const queryClient = useQueryClient();

  return useMutation<ArtifactMetadata, ApiError, UpdateArtifactContentVars>({
    mutationFn: async ({ artifact, content }) => {
      const update = { content, expectedUpdatedTimestamp: artifact.updatedTimestamp };
      const response =
        artifact.entityType === ENTITY_TYPE.AGENT_CIRCLE
          ? await updateCircleArtifactContent(artifact.entityId, artifact.filename, update)
          : await updateAgentArtifactContent(artifact.entityId, artifact.filename, update);

      return unwrapResponse(response);
    },
    onSuccess: (_metadata, { artifact }) => {
      void queryClient.invalidateQueries({
        queryKey: agentKeys.artifactContent(artifact.entityType, artifact.entityId, artifact.filename),
      });
      void queryClient.invalidateQueries({ predicate: (query) => isArtifactListQuery(query.queryKey) });
    },
  });
}
