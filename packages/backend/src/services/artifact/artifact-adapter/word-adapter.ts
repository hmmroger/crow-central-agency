import mammoth from "mammoth";
import { NodeHtmlMarkdown } from "node-html-markdown";
import type { ArtifactAdapter } from "../../artifact/artifact-manager.types.js";
import { sanitizeHtml } from "../../../utils/html-sanitizer.js";
import { getTableCustomTranslator } from "../../../utils/nhm-extensions/table-custom-translator.js";
import { logger } from "../../../utils/logger.js";

const log = logger.child({ context: "word-adapter" });

export class WordArtifactAdapter implements ArtifactAdapter {
  private nhm: NodeHtmlMarkdown;

  constructor() {
    this.nhm = new NodeHtmlMarkdown(
      {
        bulletMarker: "-",
        useInlineLinks: true,
      },
      { ...getTableCustomTranslator() }
    );
  }

  public async convertArtifact(artifactInput: Buffer): Promise<string> {
    const result = await mammoth.convertToHtml({ buffer: artifactInput });
    if (result.messages.length > 0) {
      log.warn({ messages: result.messages }, "Mammoth conversion produced warnings");
    }

    const sanitizedHtml = sanitizeHtml(result.value);
    return this.nhm.translate(sanitizedHtml);
  }
}
