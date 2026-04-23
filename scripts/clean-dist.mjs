import { rmSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve(process.cwd(), "dist");

rmSync(DIST, { recursive: true, force: true });
console.log(`clean-dist: removed ${DIST}`);
