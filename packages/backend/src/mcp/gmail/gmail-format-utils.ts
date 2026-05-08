import type { GmailMessageSummary } from "../../services/google/google-client.types.js";

/**
 * Render a Gmail message summary (headers + snippet) as agent-readable text.
 */
export function formatGmailMessageSummary(message: GmailMessageSummary): string {
  const lines = [
    `ID: ${message.id}`,
    `Thread: ${message.threadId}`,
    `From: ${message.from ?? "(unknown sender)"}`,
    `To: ${message.to ?? "(unknown recipient)"}`,
  ];

  if (message.cc) {
    lines.push(`Cc: ${message.cc}`);
  }

  if (message.bcc) {
    lines.push(`Bcc: ${message.bcc}`);
  }

  lines.push(
    `Subject: ${message.subject ?? "(no subject)"}`,
    `Date: ${message.date ?? "(no date)"}`,
    `Labels: ${message.labelIds.length > 0 ? message.labelIds.join(", ") : "(none)"}`
  );

  if (message.snippet) {
    lines.push(`Snippet: ${message.snippet}`);
  }

  return lines.join("\n");
}
