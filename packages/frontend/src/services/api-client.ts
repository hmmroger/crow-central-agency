import type { ApiResponse } from "./api-client.types.js";

const BASE_URL = "/api";

/**
 * REST API client for communicating with the backend.
 * All methods return typed ApiResponse wrappers.
 */
export const apiClient = {
  /** GET request */
  async get<T>(path: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`);

    return response.json() as Promise<ApiResponse<T>>;
  },

  /** POST request with JSON body */
  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json() as Promise<ApiResponse<T>>;
  },

  /** PATCH request with JSON body */
  async patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return response.json() as Promise<ApiResponse<T>>;
  },

  /** DELETE request */
  async del<T>(path: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
    });

    return response.json() as Promise<ApiResponse<T>>;
  },
};
