import type {
  GoogleContact,
  GoogleContactEmail,
  GoogleContactOrganization,
  GoogleContactPhone,
} from "../../services/google/google-client.types.js";

export function formatGoogleContactList(contacts: GoogleContact[]): string {
  if (contacts.length === 0) {
    return "(no matching contacts)";
  }

  const lines = [`[Matching contacts: ${contacts.length}]`];
  for (const contact of contacts) {
    lines.push(formatGoogleContact(contact));
  }

  return lines.join("\n");
}

function formatGoogleContact(contact: GoogleContact): string {
  const lines = [
    `  - ID: ${contact.resourceName}`,
    `    - Name: ${contact.displayName ?? buildFallbackName(contact) ?? "(no name)"}`,
  ];
  if (contact.emails.length > 0) {
    lines.push(`    - Emails:`);
    for (const email of contact.emails) {
      lines.push(`        - ${formatEmail(email)}`);
    }
  }

  if (contact.phones.length > 0) {
    lines.push(`    - Phones:`);
    for (const phone of contact.phones) {
      lines.push(`        - ${formatPhone(phone)}`);
    }
  }

  if (contact.organizations.length > 0) {
    const primary = contact.organizations[0];
    const orgLine = formatOrganization(primary);
    if (orgLine !== undefined) {
      lines.push(`    - Organization: ${orgLine}`);
    }
  }

  return lines.join("\n");
}

function buildFallbackName(contact: GoogleContact): string | undefined {
  const parts = [contact.givenName, contact.familyName].filter((part) => part !== undefined && part.length > 0);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function formatEmail(email: GoogleContactEmail): string {
  return email.type !== undefined ? `${email.value} (${email.type})` : email.value;
}

function formatPhone(phone: GoogleContactPhone): string {
  return phone.type !== undefined ? `${phone.value} (${phone.type})` : phone.value;
}

function formatOrganization(org: GoogleContactOrganization): string | undefined {
  const parts: string[] = [];
  if (org.name !== undefined) {
    parts.push(org.name);
  }

  if (org.title !== undefined) {
    parts.push(`Title: ${org.title}`);
  }

  if (org.department !== undefined) {
    parts.push(`(${org.department})`);
  }

  return parts.length > 0 ? parts.join(" ") : undefined;
}
