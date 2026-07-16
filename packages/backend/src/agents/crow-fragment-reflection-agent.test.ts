import { describe, expect, it } from "vitest";
import { REFLECTION_AGENT_REF, REFLECTION_TEMP_PREFIX } from "@crow-central-agency/shared";
import { CROW_FRAGMENT_REFLECTION_AGENT_PERSONA } from "./crow-fragment-reflection-agent.js";
import {
  FRAGMENT_REFLECTION_BEGIN,
  FRAGMENT_REFLECTION_END,
} from "../services/fragment/fragment-reflection.constants.js";

describe("CROW_FRAGMENT_REFLECTION_AGENT_PERSONA", () => {
  it("retains the two substitution keys the agent config depends on", () => {
    expect(CROW_FRAGMENT_REFLECTION_AGENT_PERSONA.keys).toEqual(["maxWords", "firstLevelTarget"]);
  });

  it("teaches the flat string-ref output contract in the persona body", () => {
    const body = CROW_FRAGMENT_REFLECTION_AGENT_PERSONA.content.flatMap((section) => section.content).join("\n");

    expect(body).toContain(FRAGMENT_REFLECTION_BEGIN);
    expect(body).toContain(FRAGMENT_REFLECTION_END);
    expect(body).toContain(`"${REFLECTION_AGENT_REF}"`);
    expect(body).toContain(REFLECTION_TEMP_PREFIX);
    expect(body).toContain('"op": "create"');
    expect(body).toContain('"op": "link"');
    expect(body).toContain('"op": "unlink"');
    expect(body).toContain('"op": "update"');
    expect(body).toContain('"fragment"');
    expect(body).toContain('"parent"');
    expect(body).toContain('"from"');
    expect(body).toContain("{maxWords}");
    expect(body).toContain("{firstLevelTarget}");
  });
});
