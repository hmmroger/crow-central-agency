import { useMutation } from "@tanstack/react-query";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { updateAgentArtifactTags, updateCircleArtifactTags, unwrapResponse } from "../../services/api-client.js";
import type { ApiError } from "../../services/api-client.types.js";

interface UpdateArtifactTagsVars {
  artifact: ArtifactMetadata;
  addTags?: string[];
  removeTags?: string[];
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
