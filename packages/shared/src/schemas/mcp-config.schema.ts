import { z } from "zod";

/** MCP server configuration transport types */
export const MCP_CONFIG_TYPE = {
  INTERNAL: "internal",
  STDIO: "stdio",
  SSE: "sse",
  HTTP: "http",
} as const;

export type McpConfigType = (typeof MCP_CONFIG_TYPE)[keyof typeof MCP_CONFIG_TYPE];

export const InternalMcpConfigSchema = z.object({
  type: z.literal(MCP_CONFIG_TYPE.INTERNAL),
  id: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
  isDisabled: z.boolean().optional(),
});
export type InternalMcpConfig = z.infer<typeof InternalMcpConfigSchema>;

/** Zod schema for local (stdio) MCP server config */
const LocalMcpConfigSchema = z.object({
  type: z.literal(MCP_CONFIG_TYPE.STDIO),
  id: z.uuid(),
  name: z.string().min(1).max(64),
  displayName: z.string().optional(),
  description: z.string().optional(),
  isDisabled: z.boolean().optional(),
  /** When true, this server is automatically available to the Crow system agent */
  enableForCrow: z.boolean().optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
export type LocalMcpConfig = z.infer<typeof LocalMcpConfigSchema>;

/** Zod schema for remote (SSE/HTTP) MCP server config */
const RemoteMcpConfigSchema = z.object({
  type: z.enum([MCP_CONFIG_TYPE.SSE, MCP_CONFIG_TYPE.HTTP]),
  id: z.uuid(),
  name: z.string().min(1).max(64),
  displayName: z.string().optional(),
  description: z.string().optional(),
  isDisabled: z.boolean().optional(),
  /** When true, this server is automatically available to the Crow system agent */
  enableForCrow: z.boolean().optional(),
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type RemoteMcpConfig = z.infer<typeof RemoteMcpConfigSchema>;

/** Discriminated union schema for any MCP server config */
export const McpServerConfigSchema = z.discriminatedUnion("type", [LocalMcpConfigSchema, RemoteMcpConfigSchema]);
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/** Transport types that user CRUD endpoints accept (excludes the internal projection). */
export type UserMcpConfigType = McpServerConfig["type"];

/** Input for creating a new MCP config - id is generated server-side */
const CreateLocalMcpConfigInputSchema = LocalMcpConfigSchema.omit({ id: true });
const CreateRemoteMcpConfigInputSchema = RemoteMcpConfigSchema.omit({ id: true });

export const CreateMcpConfigInputSchema = z.discriminatedUnion("type", [
  CreateLocalMcpConfigInputSchema,
  CreateRemoteMcpConfigInputSchema,
]);
export type CreateMcpConfigInput = z.infer<typeof CreateMcpConfigInputSchema>;

// Update carries the same editable fields as create; the id comes from the URL param.
// Treating update as a full replace lets emptied fields (env, headers, args, description)
// clear instead of surviving a stale partial-merge on the backend.
export const UpdateMcpConfigInputSchema = CreateMcpConfigInputSchema;
export type UpdateMcpConfigInput = CreateMcpConfigInput;
