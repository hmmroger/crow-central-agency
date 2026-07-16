/**
 * Sentinel markers the fragment reflection agent wraps its sole payload in — the marker-wrapped
 * JSON reorganization plan (`ReflectionPlanSchema`). The persona instructs the model to emit only
 * the plan between these markers; the reflection routine extracts strictly between them.
 */
export const FRAGMENT_REFLECTION_BEGIN = "<<<FR:BEGIN>>>";
export const FRAGMENT_REFLECTION_END = "<<<FR:END>>>";
