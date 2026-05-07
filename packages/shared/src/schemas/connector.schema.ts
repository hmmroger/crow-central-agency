import { z } from "zod";

export const ConnectorConnectionSchema = z.object({
  profileUsername: z.string(),
  profileDisplayName: z.string().optional(),
  profilePicture: z.string().optional(),
  connectedTimestamp: z.number(),
  needsReconnect: z.boolean(),
});

export type ConnectorConnection = z.infer<typeof ConnectorConnectionSchema>;

export const ConnectorInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  configured: z.boolean(),
  connection: ConnectorConnectionSchema.optional(),
});

export type ConnectorInfo = z.infer<typeof ConnectorInfoSchema>;

/** Response from `POST /api/connectors/:id/connect`. */
export const ConnectConnectorResponseSchema = z.object({
  authUrl: z.string(),
});

export type ConnectConnectorResponse = z.infer<typeof ConnectConnectorResponseSchema>;
