import { z } from "zod";

export const AGENT_TASK_STATE = {
  OPEN: "OPEN",
  ACTIVE: "ACTIVE",
  INCOMPLETE: "INCOMPLETE",
  COMPLETED: "COMPLETED",
  CLOSED: "CLOSED",
} as const;
export type AgentTaskState = (typeof AGENT_TASK_STATE)[keyof typeof AGENT_TASK_STATE];

export const AGENT_TASK_SOURCE_TYPE = {
  AGENT: "AGENT",
  USER: "USER",
} as const;
export type AgentTaskSourceType = (typeof AGENT_TASK_SOURCE_TYPE)[keyof typeof AGENT_TASK_SOURCE_TYPE];

const UserSourceSchema = z.object({
  sourceType: z.literal(AGENT_TASK_SOURCE_TYPE.USER),
});

const AgentSourceSchema = z.object({
  sourceType: z.literal(AGENT_TASK_SOURCE_TYPE.AGENT),
  agentId: z.string(),
});

export const AgentTaskSourceSchema = z.discriminatedUnion("sourceType", [UserSourceSchema, AgentSourceSchema]);
export type AgentTaskSource = z.infer<typeof AgentTaskSourceSchema>;

export const AgentTaskItemSchema = z.object({
  id: z.string(),
  state: z.enum([
    AGENT_TASK_STATE.OPEN,
    AGENT_TASK_STATE.ACTIVE,
    AGENT_TASK_STATE.INCOMPLETE,
    AGENT_TASK_STATE.COMPLETED,
    AGENT_TASK_STATE.CLOSED,
  ]),
  originateSource: AgentTaskSourceSchema,
  dispatchSource: AgentTaskSourceSchema.optional(),
  ownerSource: AgentTaskSourceSchema.optional(),
  task: z.string(),
  createdTimestamp: z.number(),
  updatedTimestamp: z.number(),
});
export type AgentTaskItem = z.infer<typeof AgentTaskItemSchema>;

export const AgentTaskDatabaseSchema = z.object({
  version: z.number(),
  tasks: z.array(AgentTaskItemSchema),
});
export type AgentTaskDatabase = z.infer<typeof AgentTaskDatabaseSchema>;
