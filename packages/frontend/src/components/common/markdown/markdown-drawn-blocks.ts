import { MARKDOWN_WIKI_EMBED_CLASS, MARKDOWN_WIKILINK_TARGET_ATTRIBUTE } from "@crow-central-agency/shared";
import type { WikilinkResolutionMap } from "../../../hooks/queries/use-wikilink-resolve-query.types.js";
import { releaseImageElements } from "../note-image/image-element.js";
import { readHtmlviewSource } from "./markdown-htmlview-renderer.js";
import type { DrawnBlock, DrawnBlockKind } from "./markdown-drawn-blocks.types.js";

const DRAWN_BLOCK_KINDS: DrawnBlockKind[] = [
  { selector: ".mermaid-container", readKey: (element) => element.textContent ?? "" },
  { selector: ".htmlview-container", readKey: readHtmlviewSource },
  {
    selector: `.${MARKDOWN_WIKI_EMBED_CLASS}`,
    readKey: (element) => element.getAttribute(MARKDOWN_WIKILINK_TARGET_ATTRIBUTE) ?? "",
  },
];

/**
 * The blocks a renderer has drawn into its markup — mermaid diagrams, htmlview embeds and wikilink
 * embed images. A new commit of the markup holds fresh placeholders; each one takes back the drawn
 * block of the same source, so nothing already drawn is drawn again.
 */
export class MarkdownDrawnBlocks {
  /** The resolutions each wikilink embed's image was drawn from */
  public readonly embedResolutions = new WeakMap<Element, WikilinkResolutionMap>();
  private kept: DrawnBlock[] = [];

  public restore(container: HTMLElement): void {
    const keptKeys = new Map(this.kept.map((block) => [block.element, block.key]));
    const restored: DrawnBlock[] = [];

    for (const kind of DRAWN_BLOCK_KINDS) {
      const elements = Array.from(container.querySelectorAll<HTMLElement>(kind.selector));
      const present = new Set<Element>(elements);
      const pool = this.toPool(this.kept.filter((block) => block.kind === kind && !present.has(block.element)));

      for (const element of elements) {
        const keptKey = keptKeys.get(element);
        if (keptKey !== undefined) {
          restored.push({ kind, key: keptKey, element });
          continue;
        }

        const key = kind.readKey(element);
        const drawn = pool.get(key)?.shift();
        if (drawn) {
          element.replaceWith(drawn);
        }

        restored.push({ kind, key, element: drawn ?? element });
      }

      for (const leftovers of pool.values()) {
        for (const leftover of leftovers) {
          releaseImageElements(leftover);
        }
      }
    }

    this.kept = restored;
  }

  /** Lets go of the images the kept embeds hold, so they are drawn afresh if used again */
  public release(): void {
    for (const block of this.kept) {
      releaseImageElements(block.element);
      this.embedResolutions.delete(block.element);
    }
  }

  private toPool(blocks: DrawnBlock[]): Map<string, HTMLElement[]> {
    const pool = new Map<string, HTMLElement[]>();
    for (const block of blocks) {
      const elements = pool.get(block.key);
      if (elements) {
        elements.push(block.element);
      } else {
        pool.set(block.key, [block.element]);
      }
    }

    return pool;
  }
}
