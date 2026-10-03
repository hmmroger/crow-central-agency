import type { Config } from "dompurify";

/** Sanitizer config that returns a DOM fragment, so it can be inspected and converted without a second pass. */
export type PastePurifyConfig = Config & { RETURN_DOM_FRAGMENT: true };
