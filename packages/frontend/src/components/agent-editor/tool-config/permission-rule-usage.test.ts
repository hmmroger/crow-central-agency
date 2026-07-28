import { describe, expect, it } from "vitest";
import { AgentConfigSchema, type AgentConfig, type ToolConfig } from "@crow-central-agency/shared";
import { collectPermissionRuleUsage, dispositionForUsage } from "./permission-rule-usage.js";
import { TOOL_DISPOSITION } from "./tool-permission.js";

const TIMESTAMP = "2026-07-27T00:00:00.000Z";

let agentCounter = 0;

function buildAgent(toolConfig: Partial<ToolConfig>): AgentConfig {
  agentCounter += 1;

  return AgentConfigSchema.parse({
    id: `00000000-0000-4000-8000-${String(agentCounter).padStart(12, "0")}`,
    name: `agent-${agentCounter}`,
    toolConfig,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
}

describe("collectPermissionRuleUsage", () => {
  it("returns an empty list for no agents", () => {
    expect(collectPermissionRuleUsage([])).toEqual([]);
  });

  it("dedupes a rule shared across agents and counts each agent holding it", () => {
    const usage = collectPermissionRuleUsage([
      buildAgent({ autoApprovedTools: ["Bash(git commit *)"] }),
      buildAgent({ autoApprovedTools: ["Bash(git commit *)"] }),
    ]);

    expect(usage).toEqual([{ rule: "Bash(git commit *)", approvedCount: 2, deniedCount: 0 }]);
  });

  it("counts a rule approved by one agent and denied by another under both dispositions", () => {
    const usage = collectPermissionRuleUsage([
      buildAgent({ autoApprovedTools: ["Bash(rm *)"] }),
      buildAgent({ disallowedTools: ["Bash(rm *)"] }),
    ]);

    expect(usage).toEqual([{ rule: "Bash(rm *)", approvedCount: 1, deniedCount: 1 }]);
  });

  it("keeps rules that differ only by case as distinct entries", () => {
    const usage = collectPermissionRuleUsage([buildAgent({ autoApprovedTools: ["Bash(ls)", "bash(ls)"] })]);

    expect(usage.map((entry) => entry.rule)).toEqual(["Bash(ls)", "bash(ls)"]);
  });

  it("orders by total agents descending, then rule ascending", () => {
    const usage = collectPermissionRuleUsage([
      buildAgent({ autoApprovedTools: ["Read", "Write"], disallowedTools: ["Bash(rm *)"] }),
      buildAgent({ autoApprovedTools: ["Write"], disallowedTools: ["Bash(rm *)"] }),
      buildAgent({ disallowedTools: ["Bash(rm *)"] }),
    ]);

    expect(usage.map((entry) => entry.rule)).toEqual(["Bash(rm *)", "Write", "Read"]);
  });

  it("skips agents with no rule arrays configured", () => {
    const usage = collectPermissionRuleUsage([buildAgent({ autoApprovedTools: ["Read"] }), buildAgent({})]);

    expect(usage).toEqual([{ rule: "Read", approvedCount: 1, deniedCount: 0 }]);
  });
});

describe("dispositionForUsage", () => {
  it("carries Deny for a rule only ever denied", () => {
    expect(dispositionForUsage({ rule: "Bash(rm *)", approvedCount: 0, deniedCount: 2 })).toBe(TOOL_DISPOSITION.DENY);
  });

  it("uses Approve for a rule only ever approved", () => {
    expect(dispositionForUsage({ rule: "Read", approvedCount: 3, deniedCount: 0 })).toBe(TOOL_DISPOSITION.APPROVE);
  });

  it("uses Approve when the fleet disagrees", () => {
    expect(dispositionForUsage({ rule: "Bash(rm *)", approvedCount: 1, deniedCount: 1 })).toBe(
      TOOL_DISPOSITION.APPROVE
    );
  });
});
