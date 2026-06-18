import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";

/**
 * Whether the user may modify an artifact (edit tags, delete). True for artifacts the user
 * created directly or that are attributed to SYSTEM; never for agent-authored artifacts.
 */
export function canUserModifyArtifact(artifact: ArtifactMetadata): boolean {
  const { sourceType } = artifact.createdBy;
  return sourceType === AGENT_TASK_SOURCE_TYPE.USER || sourceType === AGENT_TASK_SOURCE_TYPE.SYSTEM;
}
