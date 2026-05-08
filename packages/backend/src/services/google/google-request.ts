export const GOOGLE_SERVICE_NAME = "google";

export type GoogleRequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface GoogleRequestOptions {
  url: string;
  method?: GoogleRequestMethod;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface GoogleErrorResponseBody {
  error?: { code?: number; message?: string; status?: string };
}

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
