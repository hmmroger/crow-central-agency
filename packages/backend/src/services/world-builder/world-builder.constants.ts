/**
 * Sentinel markers a World Builder agent wraps its sole payload in, whatever that payload is (a fleet
 * JSON object, a persona, an AGENT.md). Each persona instructs the model to emit only its payload
 * between these markers; {@link extractMarked} reads strictly between them and rejects responses that
 * omit them.
 */
export const WORLD_BUILDER_BEGIN = "<<<WB:BEGIN>>>";
export const WORLD_BUILDER_END = "<<<WB:END>>>";
