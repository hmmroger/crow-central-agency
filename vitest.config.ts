import { defineConfig } from "vitest/config";

/** Routes a root-launched run through each package's own config instead of matching none at all. */
export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
});
