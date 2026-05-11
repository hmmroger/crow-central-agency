import { z } from "zod";
import {
  DEFAULT_GOOGLE_CONTACTS_SEARCH_LIMIT,
  GOOGLE_CONTACTS_SEARCH_MAX_PAGE_SIZE,
  type GoogleClient,
} from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGoogleContactList } from "./google-contact-format-utils.js";

export const SEARCH_GOOGLE_CONTACTS_TOOL_NAME = "search_google_contacts";

export function getSearchGoogleContactsToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    query: z.string().min(1).describe("Free-text fragment to match against name, email, phone, or organization."),
    limit: z
      .number()
      .int()
      .positive()
      .max(GOOGLE_CONTACTS_SEARCH_MAX_PAGE_SIZE)
      .optional()
      .describe(
        `Max results (default ${DEFAULT_GOOGLE_CONTACTS_SEARCH_LIMIT}, max ${GOOGLE_CONTACTS_SEARCH_MAX_PAGE_SIZE}).`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.searchGoogleContacts({
        query: args.query,
        limit: args.limit,
      });
      return textToolResult([formatGoogleContactList(result.contacts)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to search contacts.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEARCH_GOOGLE_CONTACTS_TOOL_NAME,
    description:
      "Search the user's saved Google contacts by name, email, phone, or organization. Returns each match's ID, name, all email addresses, all phone numbers, and primary organization. Use the ID to reference the contact in future tools.",
    inputSchema,
    handler,
  };

  return config;
}
