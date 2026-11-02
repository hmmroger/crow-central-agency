import type { AgentStatus, MessageSource } from "@crow-central-agency/shared";
import type { EventMap } from "../../core/event-bus/event-bus.types.js";

export interface ArtifactRecord {
  filename: string;
  circleId?: string;
}

/** The session a turn runs in. A side turn runs in a session other than the agent's active one. */
export interface TurnSession {
  /** Session to resume; unset starts a new session */
  sessionId?: string;
  isSideTurn: boolean;
  /** Ledger label for the new session a turn starts, instead of one derived from the message */
  label?: string;
}

export interface AgentRuntimeManagerEvents extends EventMap {
  runtimeManagerStartup: void;
  messageDone: {
    agentId: string;
    source: MessageSource;
    lastAssistantMessage?: string;
    artifactsWritten?: ArtifactRecord[];
    isAbortedOrError?: boolean;
    error?: string;
  };
  agentStatusChanged: { agentId: string; status: AgentStatus; messageSource: MessageSource };
}
