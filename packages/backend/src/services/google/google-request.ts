import { GoogleErrorResponseBodySchema, type GoogleErrorResponseBody } from "./google-request.types.js";

export function buildGoogleUrl(baseUrl: string, query: Record<string, string | string[] | undefined> | undefined): URL {
  const url = new URL(baseUrl);
  if (!query) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

export async function safeReadGoogleError(response: Response): Promise<GoogleErrorResponseBody | undefined> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return undefined;
  }

  const parsed = GoogleErrorResponseBodySchema.safeParse(json);
  return parsed.success ? parsed.data : undefined;
}
