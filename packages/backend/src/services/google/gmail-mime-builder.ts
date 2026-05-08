const CRLF = "\r\n";
const MIME_VERSION = "1.0";
const TEXT_PLAIN_CONTENT_TYPE = 'text/plain; charset="UTF-8"';
const TEXT_HTML_CONTENT_TYPE = 'text/html; charset="UTF-8"';
const BASE64_TRANSFER_ENCODING = "base64";
const BASE64_LINE_WIDTH = 76;
const NON_ASCII_PATTERN = /\P{ASCII}/u;

export interface BuildMimeMessageOptions {
  /** Already-formatted RFC 2822 mailbox (e.g. produced by `formatFromHeader`). */
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  inReplyTo?: string;
  references?: string[];
  plainText: string;
  html: string;
}

/**
 * Build an RFC 2822 message with a multipart/alternative body
 * (text/plain + text/html, both base64 encoded for charset safety).
 * Subject is RFC 2047 encoded if it contains non-ASCII characters.
 */
export function buildMimeMessage(options: BuildMimeMessageOptions): string {
  const boundary = createBoundary();
  const lines: string[] = [];

  if (options.from) {
    lines.push(`From: ${sanitizeHeaderValue(options.from)}`);
  }

  lines.push(`To: ${buildAddressList(options.to)}`);
  if (options.cc && options.cc.length > 0) {
    lines.push(`Cc: ${buildAddressList(options.cc)}`);
  }

  if (options.bcc && options.bcc.length > 0) {
    lines.push(`Bcc: ${buildAddressList(options.bcc)}`);
  }

  lines.push(`Subject: ${encodeHeaderIfNonAscii(sanitizeHeaderValue(options.subject))}`);

  if (options.inReplyTo) {
    lines.push(`In-Reply-To: ${sanitizeHeaderValue(options.inReplyTo)}`);
  }

  if (options.references && options.references.length > 0) {
    lines.push(`References: ${options.references.map(sanitizeHeaderValue).join(" ")}`);
  }

  lines.push(`MIME-Version: ${MIME_VERSION}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");

  lines.push(`--${boundary}`);
  lines.push(`Content-Type: ${TEXT_PLAIN_CONTENT_TYPE}`);
  lines.push(`Content-Transfer-Encoding: ${BASE64_TRANSFER_ENCODING}`);
  lines.push("");
  lines.push(encodeBase64Body(options.plainText));
  lines.push("");

  lines.push(`--${boundary}`);
  lines.push(`Content-Type: ${TEXT_HTML_CONTENT_TYPE}`);
  lines.push(`Content-Transfer-Encoding: ${BASE64_TRANSFER_ENCODING}`);
  lines.push("");
  lines.push(encodeBase64Body(options.html));
  lines.push("");

  lines.push(`--${boundary}--`);

  return lines.join(CRLF);
}

/**
 * Encode an RFC 2822 message as base64url (no padding) for Gmail's `raw` field.
 */
export function encodeRawForGmail(rfc822: string): string {
  return Buffer.from(rfc822, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build an RFC 2822 mailbox from an email address and optional display name.
 * Display name is included only if ASCII; non-ASCII display names are dropped
 * for v1 (would need RFC 2047 phrase encoding to be safe alongside the addr).
 */
export function formatFromHeader(emailAddress: string, displayName: string | undefined): string {
  if (displayName === undefined) {
    return emailAddress;
  }

  const sanitized = displayName.replace(/[\r\n]+/g, " ").trim();
  if (sanitized.length === 0 || NON_ASCII_PATTERN.test(sanitized)) {
    return emailAddress;
  }

  const escaped = sanitized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}" <${emailAddress}>`;
}

function buildAddressList(addresses: string[]): string {
  return addresses.map(sanitizeHeaderValue).join(", ");
}

/** Strip CR/LF (header injection guard) and surrounding whitespace. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 base64 encoded-word for non-ASCII header values (e.g. Subject). */
function encodeHeaderIfNonAscii(value: string): string {
  if (!NON_ASCII_PATTERN.test(value)) {
    return value;
  }

  const encoded = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

/** Base64 encode and wrap at 76 chars per RFC 2045. */
function encodeBase64Body(text: string): string {
  const encoded = Buffer.from(text, "utf-8").toString("base64");
  const wrapPattern = new RegExp(`.{1,${BASE64_LINE_WIDTH}}`, "g");
  return encoded.match(wrapPattern)?.join(CRLF) ?? encoded;
}

function createBoundary(): string {
  return `crow_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}
