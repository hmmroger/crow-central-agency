import { useMutation } from "@tanstack/react-query";
import type { GenerateRequest } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import type { ApiError } from "../../services/api-client.types.js";

export type GenerateInput = GenerateRequest;

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
