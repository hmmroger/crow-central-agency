import { useCallback, useEffect, useState } from "react";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { apiClient } from "../services/api-client.js";

/**
 * Fetch artifacts list for an agent via REST.
 */
export function useAgentArtifacts(agentId: string) {
  const [artifacts, setArtifacts] = useState<ArtifactMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);

    try {
      const response = await apiClient.get<ArtifactMetadata[]>(`/agents/${agentId}/artifacts`);

      if (response.success) {
        setArtifacts(response.data);
      }
    } catch {
      // Non-fatal — empty list
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  return { artifacts, loading, refetch: fetchArtifacts };
}
