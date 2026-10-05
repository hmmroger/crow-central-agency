import mermaid from "mermaid";
import { sanitizeSvg } from "./html-sanitizer.js";
import { ensureMermaidInit } from "./mermaid-config.js";

const DIAGRAM_ID_PREFIX = "note-mermaid-";

let diagramCount = 0;

/** Renders mermaid source to sanitized SVG with the same settings the markdown reader uses. */
export async function renderMermaidSvg(source: string): Promise<string> {
  ensureMermaidInit();
  diagramCount++;

  const { svg } = await mermaid.render(`${DIAGRAM_ID_PREFIX}${diagramCount}`, source);

  return sanitizeSvg(svg);
}
