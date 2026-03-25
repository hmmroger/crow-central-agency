/**
 * Animation constants for framer-motion transitions.
 * Mirrors the CSS design tokens in index.css @theme block.
 * Only used for the 3 framer-motion components (view transitions, modal, artifact panel).
 */

/** Duration values in seconds (framer-motion uses seconds, not ms) */
export const DURATION = {
  FAST: 0.15,
  NORMAL: 0.2,
  SLOW: 0.3,
} as const;

/** Cubic-bezier easing curves matching CSS --ease-* tokens */
export const EASING = {
  OUT: [0.16, 1, 0.3, 1] as const,
  IN: [0.55, 0, 1, 0.45] as const,
  IN_OUT: [0.65, 0, 0.35, 1] as const,
};
