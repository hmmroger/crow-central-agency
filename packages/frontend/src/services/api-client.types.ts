/** Error shape returned by the backend API */
export interface ApiError {
  code: string;
  message: string;
}

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
