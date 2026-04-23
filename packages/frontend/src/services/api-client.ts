import { useAppStore } from "../stores/app-store.js";
import { getCachedLocation } from "./geolocation.js";
import type { ApiError, ApiResponse } from "./api-client.types.js";

const BASE_URL = "/api";

/** Build default headers including auth and timezone for every request */
function getDefaultHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const accessKey = useAppStore.getState().accessKey;
  if (accessKey) {
    headers["Authorization"] = `Bearer ${accessKey}`;
  }

  headers["x-client-timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const location = getCachedLocation();
  if (location) {
    headers["x-client-location"] = location;
  }

  return headers;
}

/** Parse a fetch response into a typed ApiResponse, handling non-JSON errors */
async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  // Auto-clear access key on 401 — triggers redirect to auth page
  if (response.status === 401) {
    useAppStore.getState().setAccessKey(undefined);
    return { success: false, error: { code: "unauthorized", message: "Access key expired or invalid" } };
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return { success: false, error: { code: "http_error", message: `HTTP ${response.status}: non-JSON response` } };
  }

  return response.json() as Promise<ApiResponse<T>>;
}

/**
 * Unwrap an ApiResponse for use with React Query.
 * Returns data on success, throws ApiError on failure.
 */
export function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (response.success) {
    return response.data;
  }

  const error: ApiError = response.error;

  throw error;
}

/** Raw fetch with default auth headers, returns the native Response */
export async function fetchRaw(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { headers: getDefaultHeaders() });
}

/**
 * REST API client for communicating with the backend.
 * All methods return typed ApiResponse wrappers.
 */
export const apiClient = {
  /** GET request */
  async get<T>(path: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: getDefaultHeaders(),
    });

    return parseResponse<T>(response);
  },

  /** POST request with optional JSON body */
  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers = getDefaultHeaders();
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    return parseResponse<T>(response);
  },

  /** PATCH request with JSON body */
  async patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const headers = getDefaultHeaders();
    headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

    return parseResponse<T>(response);
  },

  /** PUT request with JSON body */
  async put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const headers = getDefaultHeaders();
    headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    return parseResponse<T>(response);
  },

  /** DELETE request */
  async del<T>(path: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: getDefaultHeaders(),
    });

    return parseResponse<T>(response);
  },
};

/** Upload a file as an artifact via multipart form data */
async function uploadFormData<T>(path: string, file: File, filename?: string): Promise<ApiResponse<T>> {
  const formData = new FormData();
  formData.append("file", file);
  if (filename) {
    formData.append("filename", filename);
  }

  const headers = getDefaultHeaders();
  // Do not set Content-Type — browser sets it with the boundary

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  return parseResponse<T>(response);
}

/** Upload a file as an agent artifact */
export async function uploadArtifact<T>(agentId: string, file: File, filename?: string): Promise<ApiResponse<T>> {
  return uploadFormData(`/agents/${agentId}/artifacts`, file, filename);
}

/** Upload a file as a circle artifact */
export async function uploadCircleArtifact<T>(
  circleId: string,
  file: File,
  filename?: string
): Promise<ApiResponse<T>> {
  return uploadFormData(`/circles/${circleId}/artifacts`, file, filename);
}

/** Delete an agent artifact */
export async function deleteAgentArtifact(agentId: string, filename: string) {
  return apiClient.del(`/agents/${agentId}/artifacts/${encodeURIComponent(filename)}`);
}

/** Delete a circle artifact */
export async function deleteCircleArtifact(circleId: string, filename: string) {
  return apiClient.del(`/circles/${circleId}/artifacts/${encodeURIComponent(filename)}`);
}
