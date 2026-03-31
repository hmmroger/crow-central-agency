/**
 * WebSocket message types - Client → Server
 */
export const CLIENT_MESSAGE_TYPE = {
  SEND_MESSAGE: "send_message",
  INJECT_MESSAGE: "inject_message",
  PERMISSION_RESPONSE: "permission_response",
} as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPE)[keyof typeof CLIENT_MESSAGE_TYPE];

/**
 * WebSocket message types - Server → Client
 */
export const SERVER_MESSAGE_TYPE = {
  AGENT_TEXT: "agent_text",
  AGENT_ACTIVITY: "agent_activity",
  AGENT_RESULT: "agent_result",
  AGENT_STATUS: "agent_status",
  AGENT_UPDATED: "agent_updated",
  AGENT_USAGE: "agent_usage",
  PERMISSION_REQUEST: "permission_request",
  PERMISSION_CANCELLED: "permission_cancelled",
  ERROR: "error",
  AGENT_MESSAGE: "agent_message",
  AGENT_TOOL_PROGRESS: "agent_tool_progress",
  TASK_ADDED: "task_added",
  TASK_UPDATED: "task_updated",
  TASK_ASSIGNED: "task_assigned",
  TASK_STATE_CHANGED: "task_state_changed",
  TASK_DELETED: "task_deleted",
} as const;

export type ServerMessageType = (typeof SERVER_MESSAGE_TYPE)[keyof typeof SERVER_MESSAGE_TYPE];
