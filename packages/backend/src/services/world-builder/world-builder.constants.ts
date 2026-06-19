/**
 * Sentinel markers the Narrative Architect wraps its sole artifact in. The persona instructs the model
 * to emit only the artifact between these markers; {@link extractGenerated} reads strictly between them.
 */
export const NARRATIVE_ARTIFACT_BEGIN = "<<<WB:BEGIN>>>";
export const NARRATIVE_ARTIFACT_END = "<<<WB:END>>>";
