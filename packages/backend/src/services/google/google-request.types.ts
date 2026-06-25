import z from "zod";

export type GoogleRequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface GoogleRequestOptions {
  url: string;
  method?: GoogleRequestMethod;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/** Google's standard error envelope, returned across the REST APIs on a failed request. */
export const GoogleErrorResponseBodySchema = z.object({
  error: z
    .object({
      code: z.number().optional(),
      message: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
});

export type GoogleErrorResponseBody = z.infer<typeof GoogleErrorResponseBodySchema>;
