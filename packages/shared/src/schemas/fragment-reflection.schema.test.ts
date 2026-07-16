import { describe, expect, it } from "vitest";
import { FRAGMENT_KIND } from "./fragment.schema.js";
import { REFLECTION_AGENT_REF, REFLECTION_OP, ReflectionPlanSchema } from "./fragment-reflection.schema.js";

describe("ReflectionPlanSchema", () => {
  it("parses a plan with every op type and every node-ref variant", () => {
    const plan = {
      operations: [
        {
          op: REFLECTION_OP.CREATE,
          tempId: "$theme-1",
          kind: FRAGMENT_KIND.DOMAIN,
          cue: "Build tooling",
          body: "Sub-domain grouping build and lint knowledge.",
          parent: REFLECTION_AGENT_REF,
        },
        {
          op: REFLECTION_OP.LINK,
          fragment: "frag-1",
          parent: "$theme-1",
          from: REFLECTION_AGENT_REF,
        },
        {
          op: REFLECTION_OP.LINK,
          fragment: "frag-2",
          parent: "frag-3",
        },
        {
          op: REFLECTION_OP.UNLINK,
          fragment: "frag-4",
          parent: "frag-5",
        },
        {
          op: REFLECTION_OP.UPDATE,
          fragment: "frag-6",
          cue: "Sharper cue",
          body: "Merged body content.",
        },
      ],
    };

    const parsed = ReflectionPlanSchema.parse(plan);
    expect(parsed).toEqual(plan);
  });

  it("parses an empty plan", () => {
    expect(ReflectionPlanSchema.parse({ operations: [] })).toEqual({ operations: [] });
  });

  it("rejects an unknown op", () => {
    const result = ReflectionPlanSchema.safeParse({
      operations: [{ op: "merge", fragment: "frag-1" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a create op missing its tempId", () => {
    const result = ReflectionPlanSchema.safeParse({
      operations: [
        {
          op: REFLECTION_OP.CREATE,
          kind: FRAGMENT_KIND.DOMAIN,
          cue: "Cue",
          body: "Body",
          parent: REFLECTION_AGENT_REF,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a create op whose tempId does not start with the temp prefix", () => {
    const result = ReflectionPlanSchema.safeParse({
      operations: [
        {
          op: REFLECTION_OP.CREATE,
          tempId: "theme-1",
          kind: FRAGMENT_KIND.DOMAIN,
          cue: "Cue",
          body: "Body",
          parent: REFLECTION_AGENT_REF,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty node ref string", () => {
    const result = ReflectionPlanSchema.safeParse({
      operations: [{ op: REFLECTION_OP.UNLINK, fragment: "frag-1", parent: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a plan without an operations array", () => {
    expect(ReflectionPlanSchema.safeParse({}).success).toBe(false);
  });
});
