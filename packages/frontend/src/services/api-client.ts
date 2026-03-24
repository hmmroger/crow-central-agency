import type { ApiResponse } from "./api-client.types.js";

const BASE_URL = "/api";

/** Parse a fetch response into a typed ApiResponse, handling non-JSON errors */
async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return { success: false, error: { code: "http_error", message: `HTTP ${response.status}: non-JSON response` } };
  }

  return response.json() as Promise<ApiResponse<T>>;
}

/**
 * REST API client for communicating with the backend.
 * All methods return typed ApiResponse wrappers.
 */
export const apiClient = {
  /** GET request */
  async get<T>(path: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`);

    return parseResponse<T>(response);
  },

  /** POST request with optional JSON body */
  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      ...(body !== undefined && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });

    return parseResponse<T>(response);
  },

  /** PATCH request with JSON body */
  async patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return parseResponse<T>(response);
  },

  /** PUT request with JSON body */
  async put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return parseResponse<T>(response);
  },

  /** DELETE request */
  async del<T>(path: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
    });

    return parseResponse<T>(response);
  },
};
