import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { unescapeWikilinkTarget, type NoteMetadata } from "@crow-central-agency/shared";
import { resolveEmbedTarget } from "../../../../utils/note-image/resolved-image.js";
import { RESOLVED_IMAGE_KIND, type ResolvedImage } from "../../../../utils/note-image/resolved-image.types.js";
import { findChildren } from "./cm-extension-utils.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { IMAGE_SYNTAX_KIND, type ImageSyntax } from "./image-syntax.types.js";

const LOADABLE_PROTOCOLS = new Set(["http:", "https:"]);

function toLoadableUrl(url: string): string | undefined {
  if (!URL.canParse(url)) {
    return undefined;
  }

  const parsed = new URL(url);

  return LOADABLE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
}

function readWikiEmbed(syntaxNode: SyntaxNode, state: EditorState): ImageSyntax | undefined {
  const target = syntaxNode.getChild(SYNTAX_NODE.WIKILINK_TARGET);

  if (!target) {
    return undefined;
  }

  return {
    kind: IMAGE_SYNTAX_KIND.EMBED,
    from: syntaxNode.from,
    to: syntaxNode.to,
    source: state.sliceDoc(syntaxNode.from, syntaxNode.to),
    target: unescapeWikilinkTarget(state.sliceDoc(target.from, target.to).trim()),
  };
}

/** Only an absolute http/https url is loaded; any other image stays text. */
function readUrlImage(syntaxNode: SyntaxNode, state: EditorState): ImageSyntax | undefined {
  const marks = findChildren(syntaxNode, SYNTAX_NODE.LINK_MARK);
  const urlNode = syntaxNode.getChild(SYNTAX_NODE.URL);
  const url = urlNode ? toLoadableUrl(state.sliceDoc(urlNode.from, urlNode.to)) : undefined;

  if (marks.length < 2 || url === undefined) {
    return undefined;
  }

  return {
    kind: IMAGE_SYNTAX_KIND.URL,
    from: syntaxNode.from,
    to: syntaxNode.to,
    source: state.sliceDoc(syntaxNode.from, syntaxNode.to),
    url,
    alt: state.sliceDoc(marks[0].to, marks[1].from),
  };
}

/** The image a syntax node shows, when it is one the editor draws; images never span lines. */
export function readImageSyntax(syntaxNode: SyntaxNode, state: EditorState): ImageSyntax | undefined {
  if (state.doc.lineAt(syntaxNode.from).number !== state.doc.lineAt(syntaxNode.to).number) {
    return undefined;
  }

  if (syntaxNode.name === SYNTAX_NODE.WIKI_EMBED) {
    return readWikiEmbed(syntaxNode, state);
  }

  return syntaxNode.name === SYNTAX_NODE.IMAGE ? readUrlImage(syntaxNode, state) : undefined;
}

export function resolveImageSyntax(image: ImageSyntax, notes: NoteMetadata[]): ResolvedImage {
  if (image.kind === IMAGE_SYNTAX_KIND.URL) {
    return { kind: RESOLVED_IMAGE_KIND.URL, url: image.url, alt: image.alt };
  }

  return resolveEmbedTarget(image.target, notes);
}
