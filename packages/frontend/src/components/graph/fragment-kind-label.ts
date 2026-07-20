import { FRAGMENT_KIND, type FragmentKind } from "@crow-central-agency/shared";

/** Human-readable label for each fragment kind, shared by the tooltip and viewer dialog. */
export const KIND_LABEL: Record<FragmentKind, string> = {
  [FRAGMENT_KIND.FEEDBACK]: "Feedback",
  [FRAGMENT_KIND.LESSON]: "Lesson",
  [FRAGMENT_KIND.DOMAIN]: "Domain",
  [FRAGMENT_KIND.KNOWLEDGE]: "Knowledge",
};
