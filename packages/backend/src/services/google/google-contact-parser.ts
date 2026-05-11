import type {
  GoogleContact,
  GoogleContactEmail,
  GoogleContactOrganization,
  GoogleContactPhone,
  GoogleRawContactEmail,
  GoogleRawContactOrganization,
  GoogleRawContactPerson,
  GoogleRawContactPhone,
} from "./google-client.types.js";

export function parseGoogleContact(raw: GoogleRawContactPerson): GoogleContact {
  // Google returns names/emails/phones as arrays with the primary entry first;
  // surface the first name as the "primary" display fields, but keep the full
  // emails/phones list so an agent can pick the right one to act on.
  const primaryName = raw.names?.[0];
  const contact: GoogleContact = {
    resourceName: raw.resourceName,
    emails: (raw.emailAddresses ?? []).flatMap(parseEmail),
    phones: (raw.phoneNumbers ?? []).flatMap(parsePhone),
    organizations: (raw.organizations ?? []).flatMap(parseOrganization),
  };
  if (primaryName?.displayName !== undefined) {
    contact.displayName = primaryName.displayName;
  }

  if (primaryName?.givenName !== undefined) {
    contact.givenName = primaryName.givenName;
  }

  if (primaryName?.familyName !== undefined) {
    contact.familyName = primaryName.familyName;
  }

  return contact;
}

function parseEmail(raw: GoogleRawContactEmail): GoogleContactEmail[] {
  if (raw.value === undefined || raw.value.length === 0) {
    return [];
  }

  const email: GoogleContactEmail = { value: raw.value };
  const label = raw.formattedType ?? raw.type;
  if (label !== undefined) {
    email.type = label;
  }

  return [email];
}

function parsePhone(raw: GoogleRawContactPhone): GoogleContactPhone[] {
  if (raw.value === undefined || raw.value.length === 0) {
    return [];
  }

  const phone: GoogleContactPhone = { value: raw.value };
  const label = raw.formattedType ?? raw.type;
  if (label !== undefined) {
    phone.type = label;
  }

  return [phone];
}

function parseOrganization(raw: GoogleRawContactOrganization): GoogleContactOrganization[] {
  if (raw.name === undefined && raw.title === undefined) {
    return [];
  }

  const organization: GoogleContactOrganization = {};
  if (raw.name !== undefined) {
    organization.name = raw.name;
  }

  if (raw.title !== undefined) {
    organization.title = raw.title;
  }

  if (raw.department !== undefined) {
    organization.department = raw.department;
  }

  return [organization];
}
