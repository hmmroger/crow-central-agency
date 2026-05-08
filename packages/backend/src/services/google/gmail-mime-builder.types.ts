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
