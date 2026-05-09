import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import { GMAIL_LABEL_COLOR } from "../../services/google/google-client.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const CREATE_GMAIL_USER_LABEL_TOOL_NAME = "create_gmail_user_label";

export function getCreateGmailUserLabelToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    name: z
      .string()
      .min(1)
      .describe(
        "Display name for the new label. Use '/' to nest under a parent (e.g. 'Work/Clients/Acme' creates 'Acme' under 'Work/Clients'). Names must be unique among the connected account's user labels."
      ),
    color: z
      .enum([
        GMAIL_LABEL_COLOR.RED,
        GMAIL_LABEL_COLOR.ORANGE,
        GMAIL_LABEL_COLOR.YELLOW,
        GMAIL_LABEL_COLOR.GREEN,
        GMAIL_LABEL_COLOR.TEAL,
        GMAIL_LABEL_COLOR.BLUE,
        GMAIL_LABEL_COLOR.PURPLE,
        GMAIL_LABEL_COLOR.PINK,
        GMAIL_LABEL_COLOR.GRAY,
      ])
      .optional()
      .describe(
        `Optional named color for the label. Each name maps to a curated foreground/background pair from Gmail's allowed palette. Allowed values: ${Object.values(GMAIL_LABEL_COLOR).join(", ")}. Omit for the default (uncolored) label.`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const label = await googleClient.createGmailUserLabel({
        name: args.name,
        color: args.color,
      });
      return textToolResult(["User label created.", `Label ID: ${label.id}`, `Name: ${label.name}`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to create Gmail user label.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: CREATE_GMAIL_USER_LABEL_TOOL_NAME,
    description:
      "Create a new user-defined Gmail label (folder/tag) on the connected account. Returns the new label's ID for use with update_gmail_message_user_labels or list_gmail_messages.labelIds. Nested labels are expressed as 'Parent/Child' in the name. To list existing labels first, use list_gmail_labels.",
    inputSchema,
    handler,
  };

  return config;
}
