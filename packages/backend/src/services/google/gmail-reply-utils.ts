const ANGLE_ADDRESS_PATTERN = /<([^>]+)>/;
const REPLY_SUBJECT_PREFIX = "Re: ";
const REPLY_SUBJECT_PREFIX_PATTERN = /^re:/i;

/**
 * Split an RFC 2822 address-list header value (comma-separated, with quoted
 * display names that may themselves contain commas).
 */
export function splitAddressList(headerValue: string | undefined): string[] {
  if (headerValue === undefined) {
    return [];
  }

  const result: string[] = [];
  let buffer = "";
  let inQuotes = false;
  for (const char of headerValue) {
    if (char === '"') {
      inQuotes = !inQuotes;
      buffer += char;
    } else if (char === "," && !inQuotes) {
      const trimmed = buffer.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
      }

      buffer = "";
    } else {
      buffer += char;
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    result.push(tail);
  }

  return result;
}

/** Extract the bare email address (lowercased) from "Name <addr>" or "addr". */
export function extractEmailAddress(rawAddress: string): string {
  const match = rawAddress.match(ANGLE_ADDRESS_PATTERN);
  return (match ? match[1] : rawAddress).trim().toLowerCase();
}

export function deriveReplySubject(parentSubject: string | undefined): string {
  const trimmed = (parentSubject ?? "").trim();
  if (trimmed.length === 0) {
    return REPLY_SUBJECT_PREFIX.trimEnd();
  }

  return REPLY_SUBJECT_PREFIX_PATTERN.test(trimmed) ? trimmed : `${REPLY_SUBJECT_PREFIX}${trimmed}`;
}

/**
 * Build the References header chain for a reply: parent's References (if any)
 * with the parent's Message-ID appended. Returns undefined if the parent
 * lacked a Message-ID (no anchor to thread on).
 */
export function buildReferencesChain(
  parentMessageIdHeader: string | undefined,
  parentReferences: string | undefined
): string[] | undefined {
  if (parentMessageIdHeader === undefined) {
    return undefined;
  }

  const chain = parentReferences ? parentReferences.split(/\s+/).filter((entry) => entry.length > 0) : [];
  chain.push(parentMessageIdHeader);
  return chain;
}
