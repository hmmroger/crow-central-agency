import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../services/api-client.js";

interface ArtifactInfo {
  filename: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch artifacts list for an agent via REST.
 */
export function useAgentArtifacts(agentId: string) {
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);

    try {
      const response = await apiClient.get<ArtifactInfo[]>(`/agents/${agentId}/artifacts`);

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
