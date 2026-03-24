import mermaid from "mermaid";

let initialized = false;

export function ensureMermaidInit(): void {
  if (initialized) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "strict",
    themeVariables: {
      primaryColor: "#f4a261",
      primaryTextColor: "#fafaf9",
      primaryBorderColor: "rgba(255, 255, 255, 0.08)",
      lineColor: "#78716c",
      secondaryColor: "#16161a",
      tertiaryColor: "#1f1f24",
    },
  });

  initialized = true;
}
