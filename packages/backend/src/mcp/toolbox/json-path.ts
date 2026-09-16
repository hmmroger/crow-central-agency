import type { JsonNodeSelection, JsonPathSegment, JsonValue } from "./inspect-json.types.js";
import { JSON_PATH_SEGMENT_TYPE } from "./inspect-json.types.js";

interface PathScanner {
  path: string;
  position: number;
}

const PATH_KEY_SEPARATOR = ".";
const PATH_BRACKET_OPEN = "[";
const PATH_BRACKET_CLOSE = "]";
const PATH_QUOTE = '"';
const PATH_ESCAPE = "\\";
const PLAIN_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const IDENTIFIER_CHAR_PATTERN = /[A-Za-z0-9_$]/;
const DIGIT_PATTERN = /[0-9]/;

/** Appends an object key, quoting it when it is not a plain identifier so the result parses back to the same key. */
export const appendJsonPathKey = (basePath: string, key: string): string => {
  if (!PLAIN_IDENTIFIER_PATTERN.test(key)) {
    return `${basePath}${PATH_BRACKET_OPEN}${JSON.stringify(key)}${PATH_BRACKET_CLOSE}`;
  }

  return basePath ? `${basePath}${PATH_KEY_SEPARATOR}${key}` : key;
};

export const appendJsonPathIndex = (basePath: string, index: number): string =>
  `${basePath}${PATH_BRACKET_OPEN}${index}${PATH_BRACKET_CLOSE}`;

const getInvalidPathError = (path: string, detail: string): Error => new Error(`Invalid path "${path}": ${detail}.`);

const readQuotedKey = (scanner: PathScanner): string => {
  const { path } = scanner;
  const quoteStart = scanner.position;
  let cursor = quoteStart + 1;
  while (cursor < path.length && path[cursor] !== PATH_QUOTE) {
    cursor += path[cursor] === PATH_ESCAPE ? 2 : 1;
  }

  if (cursor >= path.length) {
    throw getInvalidPathError(path, `unterminated quoted key at position ${quoteStart}`);
  }

  const quotedKey = path.slice(quoteStart, cursor + 1);
  let parsedKey: unknown;
  try {
    parsedKey = JSON.parse(quotedKey);
  } catch {
    parsedKey = undefined;
  }

  if (typeof parsedKey !== "string") {
    throw getInvalidPathError(path, `quoted key at position ${quoteStart} is not a valid JSON string`);
  }

  scanner.position = cursor + 1;
  return parsedKey;
};

const readBracketClose = (scanner: PathScanner, bracketStart: number): void => {
  if (scanner.path[scanner.position] !== PATH_BRACKET_CLOSE) {
    throw getInvalidPathError(
      scanner.path,
      `expected "${PATH_BRACKET_CLOSE}" closing "${PATH_BRACKET_OPEN}" at position ${bracketStart}`
    );
  }

  scanner.position += 1;
};

const readBracketSegment = (scanner: PathScanner): JsonPathSegment => {
  const { path } = scanner;
  const bracketStart = scanner.position;
  scanner.position += 1;

  if (path[scanner.position] === PATH_QUOTE) {
    const key = readQuotedKey(scanner);
    readBracketClose(scanner, bracketStart);
    return { segmentType: JSON_PATH_SEGMENT_TYPE.KEY, key };
  }

  const indexStart = scanner.position;
  while (scanner.position < path.length && DIGIT_PATTERN.test(path[scanner.position])) {
    scanner.position += 1;
  }

  if (scanner.position === indexStart) {
    throw getInvalidPathError(path, `expected an array index or a quoted key at position ${indexStart}`);
  }

  const index = Number.parseInt(path.slice(indexStart, scanner.position), 10);
  readBracketClose(scanner, bracketStart);
  return { segmentType: JSON_PATH_SEGMENT_TYPE.INDEX, index };
};

const readKeySegment = (scanner: PathScanner): JsonPathSegment => {
  const { path } = scanner;
  const keyStart = scanner.position;
  while (scanner.position < path.length && IDENTIFIER_CHAR_PATTERN.test(path[scanner.position])) {
    scanner.position += 1;
  }

  if (scanner.position === keyStart) {
    throw getInvalidPathError(path, `expected a key at position ${keyStart}`);
  }

  return { segmentType: JSON_PATH_SEGMENT_TYPE.KEY, key: path.slice(keyStart, scanner.position) };
};

/** Parses a printed path back into its segments. An empty path selects the document root. */
const parseJsonPath = (path: string): JsonPathSegment[] => {
  const scanner: PathScanner = { path: path.trim(), position: 0 };
  const segments: JsonPathSegment[] = [];

  while (scanner.position < scanner.path.length) {
    const currentChar = scanner.path[scanner.position];
    if (currentChar === PATH_BRACKET_OPEN) {
      segments.push(readBracketSegment(scanner));
      continue;
    }

    if (currentChar === PATH_KEY_SEPARATOR) {
      scanner.position += 1;
    } else if (segments.length > 0) {
      throw getInvalidPathError(
        scanner.path,
        `expected "${PATH_KEY_SEPARATOR}" or "${PATH_BRACKET_OPEN}" at position ${scanner.position}`
      );
    }

    segments.push(readKeySegment(scanner));
  }

  return segments;
};

/** Resolves a path against a parsed document. A miss reports the deepest prefix that did resolve. */
export const selectJsonNode = (rootValue: JsonValue, path: string): JsonNodeSelection => {
  const segments = parseJsonPath(path);
  let currentValue = rootValue;
  let resolvedPath = "";

  for (const segment of segments) {
    if (segment.segmentType === JSON_PATH_SEGMENT_TYPE.INDEX) {
      const failedPath = appendJsonPathIndex(resolvedPath, segment.index);
      if (!Array.isArray(currentValue) || segment.index >= currentValue.length) {
        return { isFound: false, resolvedPath, failedPath };
      }

      currentValue = currentValue[segment.index];
      resolvedPath = failedPath;
      continue;
    }

    const failedPath = appendJsonPathKey(resolvedPath, segment.key);
    if (
      currentValue === null ||
      typeof currentValue !== "object" ||
      Array.isArray(currentValue) ||
      !Object.hasOwn(currentValue, segment.key)
    ) {
      return { isFound: false, resolvedPath, failedPath };
    }

    currentValue = currentValue[segment.key];
    resolvedPath = failedPath;
  }

  return { isFound: true, path: resolvedPath, value: currentValue };
};
