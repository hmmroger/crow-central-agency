import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGmailLabelList } from "./gmail-format-utils.js";

export const LIST_GMAIL_LABELS_TOOL_NAME = "list_gmail_labels";

export function getListGmailLabelsToolConfig(googleClient: GoogleClient) {
  const inputSchema = {};

  const handler: ToolHandler<typeof inputSchema> = async () => {
    try {
      const result = await googleClient.listGmailLabels();
      if (result.labels.length === 0) {
        return textToolResult(["No labels found."]);
      }

      return textToolResult([formatGmailLabelList(result.labels)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list Gmail labels.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_GMAIL_LABELS_TOOL_NAME,
    description:
      "List all Gmail labels for the connected Google account. Returns each label's ID, name, and type (system or user). Pass user label IDs to update_gmail_message_user_labels to attach/detach them on a message; for system flags (read, archived, starred, important) use update_gmail_message_state instead. Label IDs can also be passed to list_gmail_messages.labelIds for filtering. System labels (INBOX, UNREAD, STARRED, IMPORTANT, CATEGORY_*) cannot be created or deleted; user labels are user-defined folders/tags.",
    inputSchema,
    handler,
  };

  return config;
}
