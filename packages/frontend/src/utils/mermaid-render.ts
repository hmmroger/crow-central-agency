import mermaid from "mermaid";
import { sanitizeSvg } from "./html-sanitizer.js";
import { ensureMermaidInit } from "./mermaid-config.js";
import { translateHtmlEntities } from "./mermaid-entities.js";

const DIAGRAM_ID_PREFIX = "mermaid-diagram-";
const NOT_SVG_MESSAGE = "the renderer did not return an SVG";

let diagramCount = 0;

/** Renders mermaid source to a sanitized SVG element, rejecting anything other than a single SVG root. */
export async function renderMermaidDiagram(source: string): Promise<SVGSVGElement> {
  ensureMermaidInit();
  diagramCount++;

  const { svg } = await mermaid.render(`${DIAGRAM_ID_PREFIX}${diagramCount}`, translateHtmlEntities(source));
  const fragment = sanitizeSvg(svg);
  const root = fragment.firstElementChild;

  if (fragment.childElementCount !== 1 || !(root instanceof SVGSVGElement)) {
    throw new Error(NOT_SVG_MESSAGE);
  }

  return root;
}
