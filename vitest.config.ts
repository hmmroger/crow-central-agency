import { defineConfig } from "vitest/config";

/**
 * Root config so a run launched from the repo root goes through each package's own
 * config rather than silently inheriting none of their test isolation.
 */
export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
});
