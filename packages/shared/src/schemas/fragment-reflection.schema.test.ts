import { describe, expect, it } from "vitest";
import { FRAGMENT_KIND } from "./fragment.schema.js";
import { REFLECTION_NODE_REF, REFLECTION_OP, ReflectionPlanSchema } from "./fragment-reflection.schema.js";

describe("ReflectionPlanSchema", () => {
  it("parses a plan with every op type and every NodeRef variant", () => {
    const plan = {
      operations: [
        {
          op: REFLECTION_OP.CREATE,
          tempId: "theme-1",
          kind: FRAGMENT_KIND.DOMAIN,
          cue: "Build tooling",
          body: "Sub-domain grouping build and lint knowledge.",
          source: { ref: REFLECTION_NODE_REF.AGENT },
        },
        {
          op: REFLECTION_OP.LINK,
          fragment: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-1" },
          target: { ref: REFLECTION_NODE_REF.TEMP, tempId: "theme-1" },
          original: { ref: REFLECTION_NODE_REF.AGENT },
        },
        {
          op: REFLECTION_OP.LINK,
          fragment: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-2" },
          target: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-3" },
        },
        {
          op: REFLECTION_OP.UNLINK,
          fragment: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-4" },
          source: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-5" },
        },
        {
          op: REFLECTION_OP.UPDATE,
          fragment: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-6" },
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
      operations: [{ op: "merge", fragment: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-1" } }],
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
          source: { ref: REFLECTION_NODE_REF.AGENT },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed NodeRef", () => {
    const result = ReflectionPlanSchema.safeParse({
      operations: [
        {
          op: REFLECTION_OP.UNLINK,
          fragment: { ref: REFLECTION_NODE_REF.FRAGMENT, id: "frag-1" },
          source: { ref: REFLECTION_NODE_REF.TEMP },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a plan without an operations array", () => {
    expect(ReflectionPlanSchema.safeParse({}).success).toBe(false);
  });
});
