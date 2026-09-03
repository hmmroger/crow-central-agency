import { afterAll } from "vitest";
import { removeTempSystemPath, useTempSystemPath } from "./src/utils/test-system-path.mock.js";

// Runs before the test file's imports, so config/env.js captures the temp path.
await useTempSystemPath();

afterAll(removeTempSystemPath);
