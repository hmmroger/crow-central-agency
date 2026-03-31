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
  LOOP: "LOOP",
} as const;
export type AgentTaskSourceType = (typeof AGENT_TASK_SOURCE_TYPE)[keyof typeof AGENT_TASK_SOURCE_TYPE];

const UserSourceSchema = z.object({
  sourceType: z.literal(AGENT_TASK_SOURCE_TYPE.USER),
});

const AgentSourceSchema = z.object({
  sourceType: z.literal(AGENT_TASK_SOURCE_TYPE.AGENT),
  agentId: z.string(),
});

const LoopSourceSchema = z.object({
  sourceType: z.literal(AGENT_TASK_SOURCE_TYPE.LOOP),
});

export const AgentTaskSourceSchema = z.discriminatedUnion("sourceType", [
  UserSourceSchema,
  AgentSourceSchema,
  LoopSourceSchema,
]);
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

// --- REST input schemas ---

/** Input for creating a new task. Optionally assign to an agent at creation time. */
export const CreateTaskInputSchema = z.object({
  task: z.string().min(1, "Task description is required"),
  assignToAgentId: z.string().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

/** Input for updating task content (only allowed when state is OPEN). */
export const UpdateTaskInputSchema = z.object({
  task: z.string().min(1, "Task description is required"),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

/** Input for transitioning a task to a new state. */
export const UpdateTaskStateInputSchema = z.object({
  state: z.enum([
    AGENT_TASK_STATE.OPEN,
    AGENT_TASK_STATE.ACTIVE,
    AGENT_TASK_STATE.INCOMPLETE,
    AGENT_TASK_STATE.COMPLETED,
    AGENT_TASK_STATE.CLOSED,
  ]),
});
export type UpdateTaskStateInput = z.infer<typeof UpdateTaskStateInputSchema>;

/** Input for assigning a task to an agent. */
export const AssignTaskInputSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
});
export type AssignTaskInput = z.infer<typeof AssignTaskInputSchema>;
