import {
  GMAIL_LABEL_TYPE,
  type GmailLabel,
  type GmailMessageSummary,
} from "../../services/google/google-client.types.js";

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

/**
 * Render a list of Gmail labels grouped by type. System labels (INBOX,
 * UNREAD, STARRED, ...) are listed before user-defined labels.
 */
export function formatGmailLabelList(labels: GmailLabel[]): string {
  if (labels.length === 0) {
    return "(no labels)";
  }

  const systemLabels = labels.filter((label) => label.type === GMAIL_LABEL_TYPE.SYSTEM);
  const userLabels = labels.filter((label) => label.type === GMAIL_LABEL_TYPE.USER);
  const sections: string[] = [];
  if (systemLabels.length > 0) {
    sections.push(["System labels:", ...systemLabels.map(formatGmailLabelLine)].join("\n"));
  }

  if (userLabels.length > 0) {
    sections.push(["User labels:", ...userLabels.map(formatGmailLabelLine)].join("\n"));
  }

  return sections.join("\n\n");
}

function formatGmailLabelLine(label: GmailLabel): string {
  return `  ${label.id} - ${label.name}`;
}
