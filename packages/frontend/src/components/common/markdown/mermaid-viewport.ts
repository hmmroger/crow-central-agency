const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;

export const MERMAID_VIEWPORT_SELECTOR = ".mermaid-viewport";
export const MERMAID_ZOOM_BUTTON_SELECTOR = ".mermaid-zoom-btn";
export const MERMAID_CONTROLS_SELECTOR = ".mermaid-controls";

function createZoomButton(action: string, label: string, symbol: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mermaid-zoom-btn";
  button.dataset.zoomAction = action;
  button.setAttribute("aria-label", label);
  button.textContent = symbol;
  return button;
}

/**
 * Build a zoom/pan viewport with overlay controls around an already-rendered
 * mermaid SVG. Uses DOM methods only — the SVG was sanitized by the shared
 * mermaid renderer before it reached here.
 */
export function createMermaidViewport(svg: Element): HTMLDivElement {
  const viewport = document.createElement("div");
  viewport.className = "mermaid-viewport";
  viewport.dataset.zoom = "1";
  viewport.dataset.panX = "0";
  viewport.dataset.panY = "0";

  const stage = document.createElement("div");
  stage.className = "mermaid-stage";
  stage.appendChild(svg);

  const controls = document.createElement("div");
  controls.className = "mermaid-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Diagram zoom controls");
  controls.append(
    createZoomButton("out", "Zoom out", "−"),
    createZoomButton("reset", "Reset zoom", "↺"),
    createZoomButton("in", "Zoom in", "+")
  );

  viewport.append(stage, controls);
  return viewport;
}

export function readViewportState(viewport: HTMLElement) {
  const zoom = Number(viewport.dataset.zoom) || 1;
  const panX = Number(viewport.dataset.panX) || 0;
  const panY = Number(viewport.dataset.panY) || 0;
  return { zoom, panX, panY };
}

export function applyViewportTransform(viewport: HTMLElement) {
  const stage = viewport.querySelector<HTMLElement>(".mermaid-stage");
  if (!stage) {
    return;
  }

  const { zoom, panX, panY } = readViewportState(viewport);
  stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  viewport.dataset.interactive = zoom > 1 ? "true" : "false";
}

export function zoomViewport(viewport: HTMLElement, action: string, focal?: { x: number; y: number }) {
  const { zoom, panX, panY } = readViewportState(viewport);
  let nextZoom = zoom;
  if (action === "in") {
    nextZoom = Math.min(zoom * ZOOM_STEP, MAX_ZOOM);
  } else if (action === "out") {
    nextZoom = Math.max(zoom / ZOOM_STEP, MIN_ZOOM);
  } else if (action === "reset") {
    nextZoom = 1;
  }

  if (nextZoom <= 1) {
    viewport.dataset.panX = "0";
    viewport.dataset.panY = "0";
  } else if (focal && nextZoom !== zoom) {
    // Focal-point zoom: keep the point under `focal` visually stationary.
    // Stage uses transform-origin: center, which (for a stage that fills
    // the viewport) aligns with the viewport center.
    const rect = viewport.getBoundingClientRect();
    const offsetX = focal.x - rect.width / 2;
    const offsetY = focal.y - rect.height / 2;
    const ratio = nextZoom / zoom;
    viewport.dataset.panX = String(offsetX + ratio * (panX - offsetX));
    viewport.dataset.panY = String(offsetY + ratio * (panY - offsetY));
  }

  viewport.dataset.zoom = String(nextZoom);
  applyViewportTransform(viewport);
}
