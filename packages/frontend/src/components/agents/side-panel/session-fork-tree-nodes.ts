import { GitBranch, MessageSquare, MessageSquareOff } from "lucide-react";
import type { SessionFork, SessionForkPoints } from "@crow-central-agency/shared";
import { formatRelativeTime } from "../../../utils/format-utils.js";
import type { TreeNode } from "../../common/tree/tree.types.js";
import { SESSION_FORK_NODE_TYPE, type SessionForkNodeData } from "./session-forks.types.js";

const UNAVAILABLE_FORKS_NODE_ID = "unavailable-forks";

function toForkNode(fork: SessionFork, disabled: boolean): TreeNode<SessionForkNodeData> {
  return {
    id: fork.sessionId,
    label: fork.label,
    detail: formatRelativeTime(fork.lastUpdatedTimestamp),
    isDisabled: disabled,
    icon: GitBranch,
    isExpandable: false,
    children: [],
    data: { type: SESSION_FORK_NODE_TYPE.FORK, sessionId: fork.sessionId },
  };
}

/** Fork points as parents of their forks, with the unavailable group first. */
export function toSessionForkTreeNodes(
  { forkPoints, unavailableForks }: SessionForkPoints,
  disabled: boolean
): TreeNode<SessionForkNodeData>[] {
  const nodes = forkPoints.map((forkPoint): TreeNode<SessionForkNodeData> => ({
    id: forkPoint.messageId,
    label: forkPoint.excerpt,
    icon: MessageSquare,
    isExpandable: true,
    children: forkPoint.forks.map((fork) => toForkNode(fork, disabled)),
    data: { type: SESSION_FORK_NODE_TYPE.FORK_POINT, messageId: forkPoint.messageId },
  }));

  if (unavailableForks.length > 0) {
    nodes.unshift({
      id: UNAVAILABLE_FORKS_NODE_ID,
      label: "Message no longer available",
      icon: MessageSquareOff,
      isExpandable: true,
      children: unavailableForks.map((fork) => toForkNode(fork, disabled)),
    });
  }

  return nodes;
}
