import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { ArtifactManager } from "../services/artifact/artifact-manager.js";
import { validateAgentIdParam, validateCircleIdParam } from "../utils/validation.js";
import {
  AGENT_TASK_SOURCE_TYPE,
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_TYPE,
  ArtifactContentTypeSchema,
  ArtifactUpdateSchema,
} from "@crow-central-agency/shared";
import type { ArtifactContentType, ArtifactUpdate } from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { Multipart } from "@fastify/multipart";
import { getMimeTypeByFilename } from "../utils/mime-type.js";

/** Max artifact payload size, shared by the multipart upload cap and the JSON PATCH body limit */
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

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

/** Parse a JSON-encoded string array from a multipart field, or undefined */
function getTagsValue(field: Multipart | Multipart[] | undefined): string[] | undefined {
  const raw = getFieldValue(field);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === "string")) {
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/** Validate an artifact update body, requiring at least one tag change or a content replacement */
function parseArtifactUpdate(body: unknown): ArtifactUpdate {
  const result = ArtifactUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new AppError("Invalid artifact update payload", APP_ERROR_CODES.VALIDATION);
  }

  const { addTags, removeTags, content } = result.data;
  if ((addTags?.length ?? 0) === 0 && (removeTags?.length ?? 0) === 0 && content === undefined) {
    throw new AppError("At least one tag change or content update is required", APP_ERROR_CODES.VALIDATION);
  }

  return result.data;
}

/**
 * Register artifact REST routes
 */
export async function registerArtifactRoutes(server: FastifyInstance, artifactManager: ArtifactManager) {
  await server.register(multipart, {
    limits: { fileSize: MAX_ARTIFACT_BYTES },
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
    const tags = getTagsValue(file.fields["tags"]);

    const content = await file.toBuffer();
    const metadata = await artifactManager.writeArtifact(agentId, resolvedFilename, content, {
      type: ARTIFACT_TYPE.USER,
      contentType,
      tags,
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

  /** Update a specific agent artifact — tag delta and/or raw content replacement */
  server.patch<{ Params: { id: string; filename: string } }>(
    "/api/agents/:id/artifacts/:filename",
    { bodyLimit: MAX_ARTIFACT_BYTES },
    async (request) => {
      const agentId = validateAgentIdParam(request.params.id);
      const { addTags, removeTags, content, expectedUpdatedTimestamp } = parseArtifactUpdate(request.body);
      const metadata = await artifactManager.updateArtifact(agentId, request.params.filename, {
        addTags,
        removeTags,
        content,
        expectedUpdatedTimestamp,
      });

      return { success: true, data: metadata };
    }
  );

  /** Read a specific artifact — returns raw binary with Content-Type header for non-text, JSON for text */
  server.get<{ Params: { id: string; filename: string } }>(
    "/api/agents/:id/artifacts/:filename",
    async (request, reply) => {
      const agentId = validateAgentIdParam(request.params.id);
      const { filename } = request.params;
      const { content, metadata } = await artifactManager.readArtifact(agentId, filename, { useAdapter: true });
      if (Buffer.isBuffer(content)) {
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
    const tags = getTagsValue(file.fields["tags"]);

    const content = await file.toBuffer();
    const metadata = await artifactManager.writeCircleArtifact(circleId, resolvedFilename, content, {
      type: ARTIFACT_TYPE.USER,
      contentType,
      tags,
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

  /** Update a specific circle artifact — tag delta and/or raw content replacement */
  server.patch<{ Params: { id: string; filename: string } }>(
    "/api/circles/:id/artifacts/:filename",
    { bodyLimit: MAX_ARTIFACT_BYTES },
    async (request) => {
      const circleId = validateCircleIdParam(request.params.id);
      const { addTags, removeTags, content, expectedUpdatedTimestamp } = parseArtifactUpdate(request.body);
      const metadata = await artifactManager.updateCircleArtifact(circleId, request.params.filename, {
        addTags,
        removeTags,
        content,
        expectedUpdatedTimestamp,
      });

      return { success: true, data: metadata };
    }
  );

  /** Read a specific circle artifact — returns raw binary with Content-Type header for non-text, JSON for text */
  server.get<{ Params: { id: string; filename: string } }>(
    "/api/circles/:id/artifacts/:filename",
    async (request, reply) => {
      const circleId = validateCircleIdParam(request.params.id);
      const { filename } = request.params;
      const { content, metadata } = await artifactManager.readCircleArtifact(circleId, filename, { useAdapter: true });
      if (Buffer.isBuffer(content)) {
        const mimeType = getMimeType(filename, metadata.contentType);
        return reply.type(mimeType).send(content);
      }

      return { success: true, data: { filename, content } };
    }
  );
}
