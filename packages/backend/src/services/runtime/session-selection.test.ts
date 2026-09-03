import { afterEach, describe, expect, it } from "vitest";
import { requestsNewSession } from "./session-selection.js";
import { MessageQueueManager } from "../message-queue-manager.js";
import { MESSAGE_SOURCE_TYPE, type MessageSource } from "../message-queue-manager.types.js";
import { clearTempSystemPath } from "../../utils/test-system-path.mock.js";

const AGENT_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";

/** Put a message through the real queue and hand back the source its turn will be run with */
async function roundTripThroughQueue(source: MessageSource): Promise<MessageSource> {
  const messageQueue = new MessageQueueManager();
  await messageQueue.enqueue(AGENT_ID, "scheduled work", source);
  const drained = await messageQueue.dequeue(AGENT_ID);
  if (!drained) {
    throw new Error("Queued message was not returned by dequeue");
  }

  return drained.source;
}

afterEach(async () => {
  await clearTempSystemPath();
});

describe("requestsNewSession", () => {
  it("holds for a task message that waited in the queue", async () => {
    const drainedSource = await roundTripThroughQueue({
      sourceType: MESSAGE_SOURCE_TYPE.TASK,
      taskId: TASK_ID,
      newSession: true,
    });

    expect(drainedSource).toMatchObject({ sourceType: MESSAGE_SOURCE_TYPE.TASK, newSession: true });
    expect(requestsNewSession(drainedSource)).toBe(true);
  });

  it("is false for a queued task message without the flag", async () => {
    const drainedSource = await roundTripThroughQueue({ sourceType: MESSAGE_SOURCE_TYPE.TASK, taskId: TASK_ID });

    expect(requestsNewSession(drainedSource)).toBe(false);
  });

  it("is false for a task message that opted out", () => {
    expect(requestsNewSession({ sourceType: MESSAGE_SOURCE_TYPE.TASK, taskId: TASK_ID, newSession: false })).toBe(
      false
    );
  });

  it("is false for sources that cannot carry the flag", () => {
    expect(requestsNewSession({ sourceType: MESSAGE_SOURCE_TYPE.USER })).toBe(false);
    expect(requestsNewSession({ sourceType: MESSAGE_SOURCE_TYPE.TASK_RESULT, taskId: TASK_ID })).toBe(false);
  });
});
