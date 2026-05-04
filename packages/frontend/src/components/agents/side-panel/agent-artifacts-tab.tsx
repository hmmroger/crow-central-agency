import { useAgentArtifactsQuery } from "../../../hooks/queries/use-agent-artifacts-query.js";
import { useModalDialog } from "../../../providers/modal-dialog-provider.js";
import { ArtifactPanel } from "../artifact/artifact-panel.js";
import { AddArtifactDialog } from "../artifact/add-artifact-dialog.js";

interface AgentArtifactsTabProps {
  agentId: string;
}

/** Artifacts tab — per-agent artifact list with add/refresh actions. */
export function AgentArtifactsTab({ agentId }: AgentArtifactsTabProps) {
  const { data: artifacts = [], isLoading, isError, refetch } = useAgentArtifactsQuery(agentId);
  const { showDialog } = useModalDialog();

  const handleAdd = () => {
    showDialog({
      id: "add-artifact",
      component: AddArtifactDialog,
      componentProps: { agentId, onUploaded: () => void refetch() },
      title: "Add Artifact",
      className: "w-[95vw] md:w-sm",
    });
  };

  return (
    <ArtifactPanel
      artifacts={artifacts}
      loading={isLoading}
      isError={isError}
      onRefresh={() => void refetch()}
      onAdd={handleAdd}
      label="Artifacts"
    />
  );
}
