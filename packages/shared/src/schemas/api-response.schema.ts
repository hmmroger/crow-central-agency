import { z } from "zod";

/**
 * Standard API success response wrapper
 */
export const createApiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

/**
 * Standard API error response
 */
export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/**
 * Payload of the endpoints whose only result is that the entity is gone.
 */
export const DeletedResultSchema = z.object({
  deleted: z.boolean(),
});

export type DeletedResult = z.infer<typeof DeletedResultSchema>;

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
