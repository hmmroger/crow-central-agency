import { mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

export default mergeConfig(sharedConfig, {
  test: {
    setupFiles: ["./vitest.setup.ts"],
    env: {
      LOG_LEVEL: "silent",
    },
  },
});
