import { z } from "zod";
import { ENTITY_TYPE, FRAGMENT_MAX_WORDS, FragmentKindSchema } from "@crow-central-agency/shared";
import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { FragmentParent } from "../../services/fragment/fragment-manager.types.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { signalActiveDomain } from "./active-domain-signal.js";
import { assertFragmentAccessible } from "./fragment-tool-utils.js";

export const WRITE_FRAGMENT_TOOL_NAME = "write_fragment";

/** Map a tool-facing node id to the manager's typed parent: the acting agent's own id anchors, anything else is a fragment id */
export function toFragmentParent(agentId: string, parent: string): FragmentParent {
  return parent === agentId
    ? { entityType: ENTITY_TYPE.AGENT, entityId: agentId }
    : { entityType: ENTITY_TYPE.FRAGMENT, entityId: parent };
}

export function getWriteFragmentToolConfig(
  agentId: string,
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager
) {
  const inputSchema = {
    kind: FragmentKindSchema.describe(
      "FEEDBACK: a piece of user feedback. LESSON: a lesson from your own work outcomes. DOMAIN: an area you work in that other fragments organize under. KNOWLEDGE: a specific fact, a leaf under a DOMAIN."
    ),
    cue: z.string().min(1).describe("Short one-line descriptor used to recognize when this fragment is relevant."),
    body: z.string().min(1).describe(`The lesson or fact itself, at most ${FRAGMENT_MAX_WORDS} words.`),
    source: z
      .string()
      .min(1)
      .describe(
        "The node the new fragment hangs under: your own agent id for a top-level fragment, or an existing fragment id to nest under it. KNOWLEDGE requires a DOMAIN fragment id."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ kind, cue, body, source }) => {
    try {
      // toFragmentParent maps only the acting agent's own id to an agent anchor,
      // so the source is either self or a fragment the agent must be able to reach
      const parentNode = toFragmentParent(agentId, source);
      if (parentNode.entityType === ENTITY_TYPE.FRAGMENT) {
        assertFragmentAccessible(fragmentManager, agentId, parentNode.entityId);
      }

      const fragment = await fragmentManager.createFragment({ kind, cue, body, parent: parentNode });

      await signalActiveDomain(agentId, fragment.id, fragmentManager, runtimeManager);

      return textToolResult([`Fragment created: ${fragment.id} (${fragment.kind})`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to write fragment.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: WRITE_FRAGMENT_TOOL_NAME,
    description:
      "Save an atomic piece of experience to your fragment vault. Always requires an explicit source to hang the fragment under — pick a deliberate spot in your structure.",
    inputSchema,
    handler,
  };

  return config;
}
