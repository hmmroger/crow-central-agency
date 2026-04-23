import type { McpConfigType } from "@crow-central-agency/shared";

/** A key-value pair for env vars and headers */
export interface KeyValuePair {
  key: string;
  value: string;
}

/** Form state for the MCP config editor */
export interface McpConfigEditorFormState {
  name: string;
  description: string;
  type: McpConfigType;
  isDisabled: boolean;
  enableForCrow: boolean;
  /** stdio: command to execute */
  command: string;
  /** stdio: command arguments */
  args: string[];
  /** stdio: environment variables */
  env: KeyValuePair[];
  /** sse/http: server URL */
  url: string;
  /** sse/http: request headers */
  headers: KeyValuePair[];
}
