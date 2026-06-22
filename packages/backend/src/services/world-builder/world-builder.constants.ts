/**
 * Sentinel markers the Narrative Architect wraps its sole artifact in. The persona instructs the model
 * to emit only the artifact between these markers; {@link extractGenerated} reads strictly between them.
 */
export const NARRATIVE_ARTIFACT_BEGIN = "<<<WB:BEGIN>>>";
export const NARRATIVE_ARTIFACT_END = "<<<WB:END>>>";

/**
 * Sentinel markers the World Builder wraps its fleet-design JSON in. The persona instructs the model
 * to emit only the JSON object between these markers; the Phase 3 endpoint extracts strictly between them.
 */
export const FLEET_DESIGN_BEGIN = "<<<FLEET:BEGIN>>>";
export const FLEET_DESIGN_END = "<<<FLEET:END>>>";
