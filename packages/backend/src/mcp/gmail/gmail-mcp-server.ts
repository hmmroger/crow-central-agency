import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_GMAIL_MODIFY } from "../../connectors/google-connector.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { GoogleClient } from "../../services/google/google-client.js";
import type {
  McpServerConnectionProfilesFunc,
  McpServerConnectionsFunc,
  McpServerDefinition,
  McpServerFactory,
} from "../crow-mcp-manager.types.js";
import { getCreateGmailDraftToolConfig } from "./create-gmail-draft.js";
import { getCreateGmailUserLabelToolConfig } from "./create-gmail-user-label.js";
import { getDeleteGmailDraftToolConfig } from "./delete-gmail-draft.js";
import { getDeleteGmailUserLabelToolConfig } from "./delete-gmail-user-label.js";
import { getGetGmailMessageContentToolConfig } from "./get-gmail-message-content.js";
import { getGetGmailThreadToolConfig } from "./get-gmail-thread.js";
import { getListGmailDraftsToolConfig } from "./list-gmail-drafts.js";
import { getListGmailLabelsToolConfig } from "./list-gmail-labels.js";
import { getListGmailMessagesToolConfig } from "./list-gmail-messages.js";
import { getMoveGmailMessageToTrashToolConfig } from "./move-gmail-message-to-trash.js";
import { getReplyToGmailMessageToolConfig } from "./reply-to-gmail-message.js";
import { getSendGmailDraftToolConfig } from "./send-gmail-draft.js";
import { getSendGmailMessageToolConfig } from "./send-gmail-message.js";
import { getUpdateGmailDraftToolConfig } from "./update-gmail-draft.js";
import { getUpdateGmailMessageStateToolConfig } from "./update-gmail-message-state.js";
import { getUpdateGmailMessageUserLabelsToolConfig } from "./update-gmail-message-user-labels.js";

export const GMAIL_MCP_SERVER_NAME = "crow-gmail";

export function createGmailMcpServer(googleClient: GoogleClient): McpSdkServerConfigWithInstance {
  const listMessages = getListGmailMessagesToolConfig(googleClient);
  const getMessageContent = getGetGmailMessageContentToolConfig(googleClient);
  const getThread = getGetGmailThreadToolConfig(googleClient);
  const sendMessage = getSendGmailMessageToolConfig(googleClient);
  const replyToMessage = getReplyToGmailMessageToolConfig(googleClient);
  const moveToTrash = getMoveGmailMessageToTrashToolConfig(googleClient);
  const listLabels = getListGmailLabelsToolConfig(googleClient);
  const updateUserLabels = getUpdateGmailMessageUserLabelsToolConfig(googleClient);
  const updateState = getUpdateGmailMessageStateToolConfig(googleClient);
  const createUserLabel = getCreateGmailUserLabelToolConfig(googleClient);
  const deleteUserLabel = getDeleteGmailUserLabelToolConfig(googleClient);
  const createDraft = getCreateGmailDraftToolConfig(googleClient);
  const updateDraft = getUpdateGmailDraftToolConfig(googleClient);
  const sendDraft = getSendGmailDraftToolConfig(googleClient);
  const deleteDraft = getDeleteGmailDraftToolConfig(googleClient);
  const listDrafts = getListGmailDraftsToolConfig(googleClient);

  return createSdkMcpServer({
    name: GMAIL_MCP_SERVER_NAME,
    tools: [
      tool(listMessages.name, listMessages.description, listMessages.inputSchema, listMessages.handler, {
        annotations: listMessages.annotations,
      }),
      tool(
        getMessageContent.name,
        getMessageContent.description,
        getMessageContent.inputSchema,
        getMessageContent.handler,
        { annotations: getMessageContent.annotations }
      ),
      tool(getThread.name, getThread.description, getThread.inputSchema, getThread.handler, {
        annotations: getThread.annotations,
      }),
      tool(sendMessage.name, sendMessage.description, sendMessage.inputSchema, sendMessage.handler, {
        annotations: sendMessage.annotations,
      }),
      tool(replyToMessage.name, replyToMessage.description, replyToMessage.inputSchema, replyToMessage.handler, {
        annotations: replyToMessage.annotations,
      }),
      tool(moveToTrash.name, moveToTrash.description, moveToTrash.inputSchema, moveToTrash.handler, {
        annotations: moveToTrash.annotations,
      }),
      tool(listLabels.name, listLabels.description, listLabels.inputSchema, listLabels.handler, {
        annotations: listLabels.annotations,
      }),
      tool(
        updateUserLabels.name,
        updateUserLabels.description,
        updateUserLabels.inputSchema,
        updateUserLabels.handler,
        { annotations: updateUserLabels.annotations }
      ),
      tool(updateState.name, updateState.description, updateState.inputSchema, updateState.handler, {
        annotations: updateState.annotations,
      }),
      tool(createUserLabel.name, createUserLabel.description, createUserLabel.inputSchema, createUserLabel.handler, {
        annotations: createUserLabel.annotations,
      }),
      tool(deleteUserLabel.name, deleteUserLabel.description, deleteUserLabel.inputSchema, deleteUserLabel.handler, {
        annotations: deleteUserLabel.annotations,
      }),
      tool(createDraft.name, createDraft.description, createDraft.inputSchema, createDraft.handler, {
        annotations: createDraft.annotations,
      }),
      tool(updateDraft.name, updateDraft.description, updateDraft.inputSchema, updateDraft.handler, {
        annotations: updateDraft.annotations,
      }),
      tool(sendDraft.name, sendDraft.description, sendDraft.inputSchema, sendDraft.handler, {
        annotations: sendDraft.annotations,
      }),
      tool(deleteDraft.name, deleteDraft.description, deleteDraft.inputSchema, deleteDraft.handler, {
        annotations: deleteDraft.annotations,
      }),
      tool(listDrafts.name, listDrafts.description, listDrafts.inputSchema, listDrafts.handler, {
        annotations: listDrafts.annotations,
      }),
    ],
  });
}

export function getGmailMcpServerDefinition(
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): McpServerDefinition {
  const serverFactory: McpServerFactory = (agentId) =>
    createGmailMcpServer(new GoogleClient(connectorManager, sensorManager, agentId));
  const hasRequiredConnections: McpServerConnectionsFunc = async (agentId) => {
    try {
      const access = await connectorManager.getAccess(agentId, CONNECTOR_ID.GOOGLE);
      if (!access.grantedScopes.includes(SCOPE_GMAIL_MODIFY)) {
        return false;
      }

      return true;
    } catch {
      // not an issue if failed
      return false;
    }
  };

  const getConnectionProfiles: McpServerConnectionProfilesFunc = async (agentId) => {
    try {
      const profile = await connectorManager.getProfile(agentId, CONNECTOR_ID.GOOGLE);
      return {
        [CONNECTOR_ID.GOOGLE]: profile,
      };
    } catch {
      // not an issue if failed
      return undefined;
    }
  };

  return {
    serverFactory,
    hasRequiredConnections,
    getConnectionProfiles,
    isConfigurable: true,
    displayName: "Gmail",
  };
}
