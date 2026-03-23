import fs from "node:fs/promises";
import path from "node:path";
import type { ArtifactInfo } from "./artifact-manager.types.js";
import { assertWithinBase, ensureDir } from "../utils/fs-utils.js";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "artifact-manager" });

/**
 * Manages artifact files under each agent's artifacts/ directory.
 * Path traversal protection on all operations.
 */
export class ArtifactManager {
  private readonly agentsBaseDir: string;

  constructor(crowSystemPath: string) {
    this.agentsBaseDir = path.join(crowSystemPath, "agents");
  }

  /** List all artifacts for an agent */
  async listArtifacts(agentId: string): Promise<ArtifactInfo[]> {
    const artifactsDir = this.getArtifactsDir(agentId);

    try {
      const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
      const artifacts: ArtifactInfo[] = [];

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const filePath = path.join(artifactsDir, entry.name);
        const stat = await fs.stat(filePath);

        artifacts.push({
          filename: entry.name,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        });
      }

      return artifacts;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  /** Read an artifact file content */
  async readArtifact(agentId: string, filename: string): Promise<string> {
    const filePath = this.getArtifactPath(agentId, filename);

    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new AppError(`Artifact not found: ${filename}`, AppErrorCodes.ArtifactNotFound);
      }

      throw error;
    }
  }

  /** Write an artifact file */
  async writeArtifact(agentId: string, filename: string, content: string): Promise<void> {
    const artifactsDir = this.getArtifactsDir(agentId);
    await ensureDir(artifactsDir);

    const filePath = this.getArtifactPath(agentId, filename);
    await fs.writeFile(filePath, content, "utf-8");

    log.info({ agentId, filename }, "Artifact written");
  }

  /** Get the most recent artifact for an agent (by modification time) */
  async getMostRecentArtifact(agentId: string): Promise<ArtifactInfo | undefined> {
    const artifacts = await this.listArtifacts(agentId);

    if (artifacts.length === 0) {
      return undefined;
    }

    return artifacts.sort(
      (fileA, fileB) => new Date(fileB.updatedAt).getTime() - new Date(fileA.updatedAt).getTime()
    )[0];
  }

  /** Get the artifacts directory for an agent with traversal protection */
  private getArtifactsDir(agentId: string): string {
    const agentDir = path.join(this.agentsBaseDir, agentId);
    assertWithinBase(agentDir, this.agentsBaseDir);

    return path.join(agentDir, "artifacts");
  }

  /** Get the full path to an artifact file with traversal protection */
  private getArtifactPath(agentId: string, filename: string): string {
    const artifactsDir = this.getArtifactsDir(agentId);
    const filePath = path.join(artifactsDir, filename);
    assertWithinBase(filePath, artifactsDir);

    return filePath;
  }
}
