import type { GoogleErrorResponseBody } from "./google-request.types.js";

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
  try {
    return (await response.json()) as GoogleErrorResponseBody;
  } catch {
    return undefined;
  }
}
