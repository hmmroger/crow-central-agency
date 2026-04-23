import type { AgentStatus, MessageSource } from "@crow-central-agency/shared";
import type { EventMap } from "../../core/event-bus/event-bus.types.js";

export interface ArtifactRecord {
  filename: string;
  circleId?: string;
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
