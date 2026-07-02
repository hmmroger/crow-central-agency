import type { ArtifactUpdate } from "@crow-central-agency/shared";

/** Error shape returned by the backend API */
export interface ApiError {
  code: string;
  message: string;
}

/** Payload for a content-only artifact PATCH: required new content plus the optimistic-lock timestamp */
export type ArtifactContentUpdate = Required<Pick<ArtifactUpdate, "content" | "expectedUpdatedTimestamp">>;

/** Standard API response wrapper */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
