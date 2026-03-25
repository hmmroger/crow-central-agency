import { useMutation } from "@tanstack/react-query";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import type { ApiError } from "../services/api-client.types.js";

interface GenerateInput {
  type: "persona" | "agentmd";
  prompt: string;
  context?: string;
}

interface GenerateResult {
  content: string;
}

/**
 * AI content generation mutation.
 */
export function useGenerateMutation() {
  return useMutation<GenerateResult, ApiError, GenerateInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<GenerateResult>("/generate", input);

      return unwrapResponse(response);
    },
  });
}
