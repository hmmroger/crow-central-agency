import { defineConfig } from "vitest/config";

/**
 * Shared Vitest base config for all workspace packages.
 * Package-level `vitest.config.ts` files extend this via `mergeConfig`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
