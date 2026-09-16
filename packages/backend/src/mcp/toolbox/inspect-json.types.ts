export type JsonScalar = string | number | boolean | null;

export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export const JSON_PATH_SEGMENT_TYPE = {
  KEY: "key",
  INDEX: "index",
} as const;

export interface JsonPathKeySegment {
  segmentType: typeof JSON_PATH_SEGMENT_TYPE.KEY;
  key: string;
}

export interface JsonPathIndexSegment {
  segmentType: typeof JSON_PATH_SEGMENT_TYPE.INDEX;
  index: number;
}

export type JsonPathSegment = JsonPathKeySegment | JsonPathIndexSegment;

export interface JsonNodeFound {
  isFound: true;
  path: string;
  value: JsonValue;
}

export interface JsonNodeNotFound {
  isFound: false;
  /** Deepest prefix of the requested path that did resolve, empty for the document root. */
  resolvedPath: string;
  failedPath: string;
}

export type JsonNodeSelection = JsonNodeFound | JsonNodeNotFound;

export interface RenderJsonOutlineOptions {
  /** Container levels expanded below the rendered node. */
  depth?: number;
  /** Path of the rendered node, prefixed to every emitted line. Empty for the document root. */
  basePath?: string;
  maxArrayItems?: number;
  maxValueLength?: number;
}
