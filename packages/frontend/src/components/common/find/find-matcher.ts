import type { FindItem, FindMatch, FindQuery, FindRange } from "./find.types.js";

const REGEX_SPECIAL_PATTERN = /[.*+?^${}()|[\]\\]/g;
const WHITESPACE_RUN_PATTERN = /\s+/;

function toQueryPattern(query: FindQuery): RegExp | undefined {
  const parts = query.text.split(WHITESPACE_RUN_PATTERN).map((part) => part.replace(REGEX_SPECIAL_PATTERN, "\\$&"));
  const source = parts.join(String.raw`\s+`);
  if (!source || source === String.raw`\s+`) {
    return undefined;
  }

  return new RegExp(source, query.isCaseSensitive ? "gu" : "giu");
}

/** Every match of the query in one text, in text order */
export function matchFindText(text: string, query: FindQuery): FindRange[] {
  const pattern = toQueryPattern(query);
  if (!pattern) {
    return [];
  }

  return Array.from(text.matchAll(pattern), (match) => ({ start: match.index, end: match.index + match[0].length }));
}

/** Every match of the query across the items, in item then text order */
export function matchFindItems(items: FindItem[], query: FindQuery): FindMatch[] {
  return items.flatMap((item) =>
    matchFindText(item.text, query).map(({ start, end }) => ({ itemId: item.id, start, end }))
  );
}

/** The current match after a recount: the first at or after the previous one, else the first */
export function locateCurrentMatch(items: FindItem[], matches: FindMatch[], previous?: FindMatch): number | undefined {
  if (matches.length === 0) {
    return undefined;
  }

  if (!previous) {
    return 0;
  }

  const itemOrder = new Map(items.map((item, index) => [item.id, index]));
  const previousOrder = itemOrder.get(previous.itemId) ?? -1;
  const index = matches.findIndex((match) => {
    const order = itemOrder.get(match.itemId) ?? -1;
    return order > previousOrder || (order === previousOrder && match.start >= previous.start);
  });

  return index === -1 ? 0 : index;
}
