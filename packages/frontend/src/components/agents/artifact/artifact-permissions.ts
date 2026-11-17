import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";

/**
 * Whether the user may edit an artifact's raw content. True only for artifacts the user created
 * directly or that are attributed to SYSTEM; agent-authored content stays read-only to the user.
 * Deleting and tag editing are allowed on every artifact and need no per-artifact check.
 */
export function canUserEditArtifactContent(artifact: ArtifactMetadata): boolean {
  const { sourceType } = artifact.createdBy;
  return sourceType === AGENT_TASK_SOURCE_TYPE.USER || sourceType === AGENT_TASK_SOURCE_TYPE.SYSTEM;
}
