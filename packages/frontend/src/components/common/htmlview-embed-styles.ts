// Reading-defaults stylesheet injected into every htmlview shadow root.
//
// Element selectors only — no class vocabulary for agents to learn. Every rule
// is single-element specificity with no !important so an embed's own <style>
// (which follows this sheet in the shadow tree) always wins; :where() keeps the
// few contextual rules at that same specificity. All colors and sizes are theme
// tokens, which inherit across the shadow boundary from the document root.
export const HTMLVIEW_EMBED_STYLES = `
  :host {
    --htmlview-measure: 68ch;
    --htmlview-accent-border: 3px;
    display: block;
    max-width: 100%;
    color: var(--color-text-base);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.6;
    overflow-wrap: break-word;
  }

  *, *::before, *::after { box-sizing: border-box; }

  article, section, aside { display: block; }

  /* Constrained measure for flow text; tables/figures may span full width. */
  p, h1, h2, h3, h4, h5, h6, ul, ol, dl, blockquote { max-width: var(--htmlview-measure); }

  /* Vertical rhythm. */
  p, ul, ol, dl, blockquote, figure, table, pre, hr, details { margin: 0 0 1em; }
  :where(:first-child) { margin-top: 0; }

  h1, h2, h3, h4, h5, h6 {
    color: var(--color-text-base);
    font-weight: 600;
    line-height: 1.25;
    margin: 1.5em 0 0.5em;
  }
  h1 { font-size: var(--text-xl); }
  h2 { font-size: var(--text-lg); }
  h3 { font-size: var(--text-base); }
  h4, h5, h6 { font-size: var(--text-sm); }

  aside {
    border-left: var(--htmlview-accent-border) solid var(--color-border);
    padding-left: 1em;
    color: var(--color-text-neutral);
  }

  blockquote {
    border-left: var(--htmlview-accent-border) solid var(--color-primary);
    padding-left: 1em;
    color: var(--color-text-neutral);
    font-style: italic;
  }

  figure { margin-inline: 0; }
  figcaption {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin-top: 0.5em;
  }

  ul, ol { padding-left: 1.5em; }
  li { margin: 0.25em 0; }

  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25em 1em; }
  dt { font-weight: 600; color: var(--color-text-base); }
  dd { margin: 0; color: var(--color-text-neutral); }

  hr { border: none; border-top: 1px solid var(--color-border); }

  a { color: var(--color-primary); text-decoration: underline; }

  mark {
    background: var(--color-accent);
    color: var(--color-base);
    padding: 0 0.2em;
    border-radius: var(--radius-sm);
  }

  code, kbd { font-family: var(--font-mono); font-size: var(--text-xs); }
  code {
    background: var(--color-surface-inset);
    padding: 0.1em 0.35em;
    border-radius: var(--radius-sm);
  }
  kbd {
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0.1em 0.4em;
  }
  pre {
    background: var(--color-surface-inset);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: 1em;
    overflow-x: auto;
    max-width: 100%;
  }
  :where(pre) > code { background: none; padding: 0; }

  time { color: var(--color-text-neutral); }
  small { font-size: var(--text-xs); color: var(--color-text-muted); }

  img, picture, video, audio, canvas, svg { max-width: 100%; }
  img, video { height: auto; }

  table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  th, td { border: 1px solid var(--color-border); padding: 0.4em 0.6em; text-align: left; }
  th { background: var(--color-surface-elevated); font-weight: 600; }

  details {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 0.5em 1em;
    background: var(--color-surface);
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--color-text-base);
    list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before {
    content: "▸";
    display: inline-block;
    margin-right: 0.5em;
    color: var(--color-text-neutral);
    transition: transform var(--duration-fast);
  }
  :where(details[open]) > summary::before { transform: rotate(90deg); }
`;
