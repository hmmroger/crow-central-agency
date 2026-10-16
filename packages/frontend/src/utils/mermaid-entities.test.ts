// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { translateHtmlEntities } from "./mermaid-entities";

describe("translateHtmlEntities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("translates common names without creating a decoder", () => {
    const createElementSpy = vi.spyOn(document, "createElement");

    expect(translateHtmlEntities("&lt;&gt;&amp; A --> B")).toBe("#lt;#gt;#amp; A --> B");
    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it("creates one decoder per call for names outside the common table", () => {
    const createElementSpy = vi.spyOn(document, "createElement");

    expect(translateHtmlEntities("&spades; &clubs; &lt; A&B;")).toBe("#spades; #clubs; #lt; A&B;");
    expect(createElementSpy).toHaveBeenCalledTimes(1);
  });

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

  it("normalizes leading zeros and translates adjacent references", () => {
    expect(translateHtmlEntities("&#060;&#x003C;&lt;&gt;")).toBe("#60;#60;#lt;#gt;");
  });

  it("leaves unknown names that only look like references untouched", () => {
    expect(translateHtmlEntities("A&B;\nX&Y-->C;")).toBe("A&B;\nX&Y-->C;");
  });

  it("leaves names that only start with a legacy entity untouched", () => {
    expect(translateHtmlEntities("A&notB;\nC&ampD;")).toBe("A&notB;\nC&ampD;");
  });

  it("translates names that decode to one or two code points", () => {
    expect(translateHtmlEntities("&not; &notin; &NotEqualTilde;")).toBe("#not; #notin; #NotEqualTilde;");
  });

  it("leaves out-of-range code points untouched", () => {
    expect(translateHtmlEntities("&#x110000; &#1114112;")).toBe("&#x110000; &#1114112;");
  });

  it("leaves existing mermaid entities and raw tags untouched", () => {
    expect(translateHtmlEntities("A[#lt;b#gt; and #60;<br/>]")).toBe("A[#lt;b#gt; and #60;<br/>]");
  });

  it("keeps an escaped reference displaying as literal text", () => {
    expect(translateHtmlEntities("A->>B: &amp;lt;")).toBe("A->>B: #amp;lt;");
  });
});
