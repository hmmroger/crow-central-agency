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
