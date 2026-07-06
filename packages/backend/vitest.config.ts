import os from "node:os";
import path from "node:path";
import { mergeConfig } from "vitest/config";
import sharedConfig from "../../vitest.shared";

// Isolate any on-disk agent artifacts written during tests to a throwaway temp
// directory instead of the developer's real ~/.crow system path.
const TEST_CROW_SYSTEM_PATH = path.join(os.tmpdir(), "crow-backend-test");

export default mergeConfig(sharedConfig, {
  test: {
    env: {
      CROW_SYSTEM_PATH: TEST_CROW_SYSTEM_PATH,
      LOG_LEVEL: "silent",
    },
  },
});
