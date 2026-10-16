import { describe, expect, it } from "vitest";
import { translateHtmlEntities } from "./mermaid-entities";

describe("translateHtmlEntities", () => {
  it("translates named references", () => {
    expect(translateHtmlEntities("A->>B: List&lt;T&gt; &nbsp;")).toBe("A->>B: List#lt;T#gt; #nbsp;");
  });

  it("translates decimal references", () => {
    expect(translateHtmlEntities("A->>B: &#60;x&#62;")).toBe("A->>B: #60;x#62;");
  });

  it("translates hex references to the same code point in decimal", () => {
    expect(translateHtmlEntities("A->>B: &#x3C;&#X3e;&#x1F600;")).toBe("A->>B: #60;#62;#128512;");
  });

  it("leaves a bare ampersand untouched", () => {
    expect(translateHtmlEntities("A & B --> C\nD -->|x & y| E")).toBe("A & B --> C\nD -->|x & y| E");
  });

  it("leaves incomplete references untouched", () => {
    expect(translateHtmlEntities("a &lt b &#; c &#x; d &#xZ;")).toBe("a &lt b &#; c &#x; d &#xZ;");
  });

  it("leaves existing mermaid entities and raw tags untouched", () => {
    expect(translateHtmlEntities("A[#lt;b#gt; and #60;<br/>]")).toBe("A[#lt;b#gt; and #60;<br/>]");
  });

  it("keeps an escaped reference displaying as literal text", () => {
    expect(translateHtmlEntities("A->>B: &amp;lt;")).toBe("A->>B: #amp;lt;");
  });
});
