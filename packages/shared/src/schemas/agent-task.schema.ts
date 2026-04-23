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
  REMINDER: "REMINDER",
  SYSTEM: "SYSTEM",
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

const ReminderSourceSchema = z.object({
  sourceType: z.literal(AGENT_TASK_SOURCE_TYPE.REMINDER),
});

const SystemSourceSchema = z.object({
  sourceType: z.literal(AGENT_TASK_SOURCE_TYPE.SYSTEM),
});

export const AgentTaskSourceSchema = z.discriminatedUnion("sourceType", [
  UserSourceSchema,
  AgentSourceSchema,
  LoopSourceSchema,
  ReminderSourceSchema,
  SystemSourceSchema,
]);
export type AgentTaskSource = z.infer<typeof AgentTaskSourceSchema>;

export const AgentTaskStateSchema = z.enum([
  AGENT_TASK_STATE.OPEN,
  AGENT_TASK_STATE.ACTIVE,
  AGENT_TASK_STATE.INCOMPLETE,
  AGENT_TASK_STATE.COMPLETED,
  AGENT_TASK_STATE.CLOSED,
]);

export const AgentTaskItemSchema = z.object({
  id: z.string(),
  parentTaskId: z.string().optional(),
  state: AgentTaskStateSchema,
  originateSource: AgentTaskSourceSchema,
  dispatchSource: AgentTaskSourceSchema.optional(),
  ownerSource: AgentTaskSourceSchema.optional(),
  task: z.string(),
  taskResult: z.string().optional(),
  subTaskIds: z.array(z.string()).optional(),
  createdTimestamp: z.number(),
  updatedTimestamp: z.number(),
});
export type AgentTaskItem = z.infer<typeof AgentTaskItemSchema>;

export const AgentTaskDatabaseSchema = z.object({
  version: z.number(),
  tasks: z.array(AgentTaskItemSchema),
});
export type AgentTaskDatabase = z.infer<typeof AgentTaskDatabaseSchema>;

/** Input for creating a new task. Optionally assign an owner at creation time. */
export const CreateTaskInputSchema = z.object({
  task: z.string().min(1, "Task description is required"),
  ownerSource: AgentTaskSourceSchema.optional(),
  parentTaskId: z.string().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

/** Input for updating task content (only allowed when state is OPEN). */
export const UpdateTaskInputSchema = z.object({
  task: z.string().min(1, "Task description is required"),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

/**
 * Input for transitioning a task to a new state via REST.
 * Only includes states reachable by user action. OPEN is the initial
 * state (not a valid target), and ACTIVE is system-driven by the runtime manager.
 */
export const UpdateTaskStateInputSchema = z.object({
  state: z.enum([AGENT_TASK_STATE.INCOMPLETE, AGENT_TASK_STATE.COMPLETED, AGENT_TASK_STATE.CLOSED]),
});
export type UpdateTaskStateInput = z.infer<typeof UpdateTaskStateInputSchema>;

/** Input for assigning a task. Accepts the owner source (who will handle the task). */
export const AssignTaskInputSchema = z.object({
  ownerSource: AgentTaskSourceSchema,
});
export type AssignTaskInput = z.infer<typeof AssignTaskInputSchema>;
