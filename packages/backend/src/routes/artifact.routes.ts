import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { ArtifactManager } from "../services/artifact/artifact-manager.js";
import { validateAgentIdParam, validateCircleIdParam } from "../utils/validation.js";
import {
  AGENT_TASK_SOURCE_TYPE,
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_TYPE,
  ArtifactContentTypeSchema,
} from "@crow-central-agency/shared";
import type { ArtifactContentType } from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { Multipart } from "@fastify/multipart";
import { getMimeTypeByFilename } from "../utils/mime-type.js";

/** Resolve MIME type from filename and artifact content type */
function getMimeType(filename: string, contentType?: ArtifactContentType): string {
  if (contentType === ARTIFACT_CONTENT_TYPE.TEXT) {
    return "text/plain";
  }

  return getMimeTypeByFilename(filename) ?? "application/octet-stream";
}

/** Extract a non-empty string value from a multipart field, or undefined */
function getFieldValue(field: Multipart | Multipart[] | undefined): string | undefined {
  if (!field || Array.isArray(field) || field.type !== "field") {
    return undefined;
  }

  const value = typeof field.value === "string" ? field.value.trim() : undefined;

  return value || undefined;
}

/**
 * Register artifact REST routes
 */
export async function registerArtifactRoutes(server: FastifyInstance, artifactManager: ArtifactManager) {
  await server.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });

  /** List artifacts for an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/artifacts", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const artifacts = await artifactManager.listArtifacts(agentId);
    return { success: true, data: artifacts };
  });

  /** Upload an artifact for an agent via multipart form data */
  server.post<{ Params: { id: string } }>("/api/agents/:id/artifacts", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const file = await request.file();
    if (!file) {
      throw new AppError("No file provided", APP_ERROR_CODES.VALIDATION);
    }

    const resolvedFilename = getFieldValue(file.fields["filename"]) ?? file.filename;
    const contentType = ArtifactContentTypeSchema.safeParse(getFieldValue(file.fields["contentType"])).data;

    const content = await file.toBuffer();
    const metadata = await artifactManager.writeArtifact(agentId, resolvedFilename, content, {
      type: ARTIFACT_TYPE.USER,
      contentType,
      createdBy: { sourceType: AGENT_TASK_SOURCE_TYPE.USER },
    });

    return { success: true, data: metadata };
  });

  /** List circle artifacts accessible to an agent */
  server.get<{ Params: { id: string } }>("/api/agents/:id/circle-artifacts", async (request) => {
    const agentId = validateAgentIdParam(request.params.id);
    const artifacts = await artifactManager.listCircleArtifactsForAgent(agentId);
    return { success: true, data: artifacts };
  });

  /** Delete a specific agent artifact */
  server.delete<{ Params: { id: string; filename: string } }>(
    "/api/agents/:id/artifacts/:filename",
    async (request) => {
      const agentId = validateAgentIdParam(request.params.id);
      const deleted = await artifactManager.deleteArtifact(agentId, request.params.filename);

      return { success: true, data: { deleted } };
    }
  );

  /** Read a specific artifact — returns raw binary with Content-Type header for non-text, JSON for text */
  server.get<{ Params: { id: string; filename: string } }>(
    "/api/agents/:id/artifacts/:filename",
    async (request, reply) => {
      const agentId = validateAgentIdParam(request.params.id);
      const { filename } = request.params;
      const content = await artifactManager.readArtifact(agentId, filename, { useAdapter: true });
      if (Buffer.isBuffer(content)) {
        const metadata = await artifactManager.getArtifactMetadata(agentId, filename);
        const mimeType = getMimeType(filename, metadata.contentType);
        return reply.type(mimeType).send(content);
      }

      return { success: true, data: { filename, content } };
    }
  );

  /** Upload an artifact to a circle via multipart form data */
  server.post<{ Params: { id: string } }>("/api/circles/:id/artifacts", async (request) => {
    const circleId = validateCircleIdParam(request.params.id);
    const file = await request.file();
    if (!file) {
      throw new AppError("No file provided", APP_ERROR_CODES.VALIDATION);
    }

    const resolvedFilename = getFieldValue(file.fields["filename"]) ?? file.filename;
    const contentType = ArtifactContentTypeSchema.safeParse(getFieldValue(file.fields["contentType"])).data;

    const content = await file.toBuffer();
    const metadata = await artifactManager.writeCircleArtifact(circleId, resolvedFilename, content, {
      type: ARTIFACT_TYPE.USER,
      contentType,
      createdBy: { sourceType: AGENT_TASK_SOURCE_TYPE.USER },
    });

    return { success: true, data: metadata };
  });

  /** Delete a specific circle artifact */
  server.delete<{ Params: { id: string; filename: string } }>(
    "/api/circles/:id/artifacts/:filename",
    async (request) => {
      const circleId = validateCircleIdParam(request.params.id);
      const deleted = await artifactManager.deleteCircleArtifact(circleId, request.params.filename);

      return { success: true, data: { deleted } };
    }
  );

  /** Read a specific circle artifact — returns raw binary with Content-Type header for non-text, JSON for text */
  server.get<{ Params: { id: string; filename: string } }>(
    "/api/circles/:id/artifacts/:filename",
    async (request, reply) => {
      const circleId = validateCircleIdParam(request.params.id);
      const { filename } = request.params;
      const content = await artifactManager.readCircleArtifact(circleId, filename, { useAdapter: true });
      if (Buffer.isBuffer(content)) {
        const metadata = await artifactManager.getCircleArtifactMetadata(circleId, filename);
        const mimeType = getMimeType(filename, metadata.contentType);
        return reply.type(mimeType).send(content);
      }

      return { success: true, data: { filename, content } };
    }
  );
}
