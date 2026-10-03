/** How a wikilink's text is marked up, shared by the editor line and table cells */
export interface WikilinkMarkSpec {
  className: string;
  attributes: Record<string, string>;
}
