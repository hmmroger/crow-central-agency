export const OSM_ELEMENT_TYPE = {
  NODE: "node",
  WAY: "way",
  RELATION: "relation",
} as const;

export type OsmElementType = (typeof OSM_ELEMENT_TYPE)[keyof typeof OSM_ELEMENT_TYPE];

export interface OsmTagFilter {
  key: string;
  /** `undefined` matches any value for the key (key-existence filter). */
  value?: string;
}
